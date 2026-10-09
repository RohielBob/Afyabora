// Affiche (ou écrit dans docs/api/README.md) la table des routes du contrat gelé.
// Usage : node scripts/openapi/routes.mjs            → affiche la table
//         node scripts/openapi/routes.mjs --write    → met à jour docs/api/README.md entre les repères
import { readFileSync, writeFileSync } from 'node:fs';

const contractUrl = new URL('../../docs/api/openapi.v0.json', import.meta.url);
const readmeUrl = new URL('../../docs/api/README.md', import.meta.url);
const START = '<!-- routes:start -->';
const END = '<!-- routes:end -->';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const access = (roles) => {
  if (roles.includes('PUBLIC')) return 'public';
  if (roles.length === 1) return roles[0] === 'DOCTOR' ? 'médecin' : 'patient';
  return 'connecté';
};

const table = (rows) => {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => [...r[i]].length)));
  const line = (r) =>
    `| ${r.map((c, i) => c + ' '.repeat(widths[i] - [...c].length)).join(' | ')} |`;
  return [
    line(rows[0]),
    `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`,
    ...rows.slice(1).map(line),
  ].join('\n');
};

const contract = JSON.parse(readFileSync(contractUrl, 'utf-8'));
const out = [];
for (const tag of contract.tags) {
  const rows = [['Méthode', 'Chemin', 'Accès', 'Prio', 'État', 'Ticket']];
  for (const [path, item] of Object.entries(contract.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op || op.tags[0] !== tag.name) continue;
      rows.push([
        method.toUpperCase(),
        `\`${path}\``,
        access(op['x-roles']),
        op['x-priority'],
        op['x-status'] === 'implemented' ? 'codée' : 'à coder',
        op['x-ticket'],
      ]);
    }
  }
  if (rows.length > 1) out.push(`### ${tag.name}\n\n${tag.description}\n\n${table(rows)}`);
}
const total = Object.values(contract.paths).reduce(
  (n, item) => n + METHODS.filter((m) => item[m]).length,
  0,
);
const markdown = `${out.join('\n\n')}\n\n**${total} opérations.**`;

if (process.argv.includes('--write')) {
  const readme = readFileSync(readmeUrl, 'utf-8');
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from === -1 || to === -1)
    throw new Error(`Repères ${START} / ${END} introuvables dans docs/api/README.md`);
  writeFileSync(
    readmeUrl,
    `${readme.slice(0, from + START.length)}\n\n${markdown}\n\n${readme.slice(to)}`,
  );
  console.log('docs/api/README.md mis à jour.');
} else {
  console.log(markdown);
}
