// Tests du ticket L1-04 : garde JWT globale (JwtAuthGuard) et contrôle des rôles (RolesGuard).
// Un petit contrôleur fictif, propre à ce test, porte une route de chaque sorte ; les deux gardes sont
// déclarées globales comme dans app.module.ts. Aucune base de données n'est nécessaire.
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CurrentUser, type AuthUser } from '../src/common/decorators/current-user.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { Roles } from '../src/common/decorators/roles.decorator';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard, UNAUTHORIZED_MESSAGE } from '../src/common/guards/jwt-auth.guard';
import { FORBIDDEN_MESSAGE, RolesGuard } from '../src/common/guards/roles.guard';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';

@Controller('essai')
class EssaiController {
  @Public()
  @Get('public')
  publique() {
    return { ok: true };
  }

  @Get('connecte')
  connecte(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles('PATIENT')
  @Get('patient')
  patient(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles('DOCTOR', 'ADMIN')
  @Get('medecin')
  medecin() {
    return { ok: true };
  }
}

/** Fabrique un JWT « à la main » (pour simuler un attaquant) : en-tête et contenu libres. */
function forge(header: object, payload: object, secret?: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const signature = secret ? createHmac('sha256', secret).update(unsigned).digest('base64url') : '';
  return `${unsigned}.${signature}`;
}

describe('L1-04 : garde JWT globale et rôles', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const patientId = randomUUID();
  const now = () => Math.floor(Date.now() / 1000);

  const get = (path: string, authorization?: string) =>
    fetch(`${baseUrl}/essai/${path}`, { headers: authorization ? { authorization } : {} });
  const tokenFor = (role: string, sub: string = patientId) =>
    jwt.sign({ sub, role }, { expiresIn: 900, algorithm: 'HS256' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: SECRET })],
      controllers: [EssaiController],
      providers: [
        // Même ordre que dans app.module.ts : d'abord « qui es-tu ? », ensuite « as-tu le droit ? ».
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JwtAuthGuard (qui es-tu ?)', () => {
    it('laisse passer une route @Public() sans jeton', async () => {
      expect((await get('public')).status).toBe(200);
    });

    it('protège par défaut une route sans décorateur : 401 sans jeton, avec le message du contrat', async () => {
      const res = await get('connecte');
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ message: UNAUTHORIZED_MESSAGE });
    });

    it('accepte un jeton valide et transmet { id, role } à la route', async () => {
      const res = await get('connecte', `Bearer ${tokenFor('PATIENT')}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: patientId, role: 'PATIENT' });
    });

    it('refuse un en-tête mal formé (sans « Bearer », ou vide)', async () => {
      const token = tokenFor('PATIENT');
      expect((await get('connecte', token)).status).toBe(401);
      expect((await get('connecte', `Basic ${token}`)).status).toBe(401);
      expect((await get('connecte', 'Bearer ')).status).toBe(401);
    });

    it('refuse un jeton expiré', async () => {
      const expired = forge(
        { alg: 'HS256', typ: 'JWT' },
        { sub: patientId, role: 'PATIENT', iat: now() - 1000, exp: now() - 100 },
        SECRET,
      );
      expect((await get('connecte', `Bearer ${expired}`)).status).toBe(401);
    });

    it('refuse un jeton signé avec un autre secret, ou modifié après signature', async () => {
      const otherSecret = forge(
        { alg: 'HS256', typ: 'JWT' },
        { sub: patientId, role: 'ADMIN', exp: now() + 900 },
        'un-autre-secret-0123456789abcdef-xyz',
      );
      // Le patient remplace son rôle par ADMIN dans le contenu, sans pouvoir re-signer.
      const [header, , signature] = tokenFor('PATIENT').split('.');
      const promoted = Buffer.from(
        JSON.stringify({ sub: patientId, role: 'ADMIN', exp: now() + 900 }),
      ).toString('base64url');

      expect((await get('connecte', `Bearer ${otherSecret}`)).status).toBe(401);
      expect((await get('connecte', `Bearer ${header}.${promoted}.${signature}`)).status).toBe(401);
    });

    it('refuse un jeton « alg: none » (non signé) et un jeton d’un autre algorithme', async () => {
      const none = forge({ alg: 'none', typ: 'JWT' }, { sub: patientId, role: 'ADMIN' });
      const hs512 = jwt.sign({ sub: patientId, role: 'PATIENT' }, { algorithm: 'HS512' });

      expect((await get('connecte', `Bearer ${none}`)).status).toBe(401);
      expect((await get('connecte', `Bearer ${hs512}`)).status).toBe(401);
    });

    it('refuse un jeton bien signé mais au contenu inattendu (rôle inconnu, identifiant invalide)', async () => {
      const superUser = tokenFor('SUPERADMIN');
      const badId = tokenFor('PATIENT', 'pas-un-uuid');
      const noRole = jwt.sign({ sub: patientId }, { expiresIn: 900 });

      expect((await get('connecte', `Bearer ${superUser}`)).status).toBe(401);
      expect((await get('connecte', `Bearer ${badId}`)).status).toBe(401);
      expect((await get('connecte', `Bearer ${noRole}`)).status).toBe(401);
    });

    it('refuse un jeton de rafraîchissement utilisé comme jeton d’accès', async () => {
      const opaqueRefresh = 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXvWzE';
      expect((await get('connecte', `Bearer ${opaqueRefresh}`)).status).toBe(401);
    });
  });

  describe('RolesGuard (as-tu le droit ?)', () => {
    it('un patient accède à une route patient', async () => {
      expect((await get('patient', `Bearer ${tokenFor('PATIENT')}`)).status).toBe(200);
    });

    it('un médecin ou un admin reçoit 403 sur une route patient, avec un message clair', async () => {
      const doctor = await get('patient', `Bearer ${tokenFor('DOCTOR')}`);
      const admin = await get('patient', `Bearer ${tokenFor('ADMIN')}`);

      expect(doctor.status).toBe(403);
      expect(await doctor.json()).toEqual({ message: FORBIDDEN_MESSAGE });
      expect(admin.status).toBe(403);
    });

    it('une route à plusieurs rôles accepte chacun d’eux et refuse les autres', async () => {
      expect((await get('medecin', `Bearer ${tokenFor('DOCTOR')}`)).status).toBe(200);
      expect((await get('medecin', `Bearer ${tokenFor('ADMIN')}`)).status).toBe(200);
      expect((await get('medecin', `Bearer ${tokenFor('PATIENT')}`)).status).toBe(403);
    });

    it('sans jeton, une route à rôle répond 401 (et non 403) : on vérifie l’identité d’abord', async () => {
      expect((await get('patient')).status).toBe(401);
    });
  });
});
