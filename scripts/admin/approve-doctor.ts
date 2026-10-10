// Ancienne commande, gardée pour ne casser aucune habitude ni documentation :
//   pnpm --filter @glyka/scripts admin:approve-doctor -- <email> [--reject] [--yes]
// équivaut à `pnpm admin:doctors approve <email>` (ou `reject` avec --reject). Voir doctors-cli.ts.
import { main } from './doctors-cli.ts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const reject = args.includes('--reject');
void main([reject ? 'reject' : 'approve', ...args.filter((a) => a !== '--reject')]);
