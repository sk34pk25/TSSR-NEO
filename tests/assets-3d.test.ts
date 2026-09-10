import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSETS, assetById, licences } from '@tssr/rendering';

/**
 * Validation de la chaine d assets.
 *
 * Un modele declare mais absent produirait un decor troue en production sans
 * qu aucun test existant ne s en apercoive : la primitive de repli prendrait
 * silencieusement le relais. Ces verifications ferment ce trou, et interdisent
 * qu un asset entre dans le depot sans licence tracable.
 */

const RACINE = resolve(import.meta.dirname, '../assets/3d');

/** Plafonds de poids, en kilo-octets, par nature d objet. */
const PLAFOND_KO: Record<string, number> = {
  furniture: 120,
  props: 120,
  characters: 400,
  hardware: 250,
  environment: 600,
};

describe('registre des modeles 3D', () => {
  it('declare au moins de quoi meubler et peupler un batiment', () => {
    expect(ASSETS.length).toBeGreaterThanOrEqual(25);
    const categories = new Set(ASSETS.map((asset) => asset.category));
    expect(categories.has('furniture')).toBe(true);
    expect(categories.has('characters')).toBe(true);
  });

  it('n a aucun identifiant en double', () => {
    const ids = ASSETS.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('retrouve chaque modele par son identifiant', () => {
    for (const asset of ASSETS) {
      expect(assetById(asset.id), asset.id).toBeDefined();
    }
    expect(assetById('inexistant')).toBeUndefined();
  });
});

describe('fichiers de modeles', () => {
  for (const asset of ASSETS) {
    it(`${asset.id} est present, lisible et de taille raisonnable`, () => {
      const chemin = resolve(RACINE, asset.fichier);
      expect(existsSync(chemin), `fichier manquant : ${asset.fichier}`).toBe(true);
      const octets = statSync(chemin).size;
      expect(octets, `${asset.fichier} est vide`).toBeGreaterThan(512);
      const plafond = (PLAFOND_KO[asset.category] ?? 200) * 1024;
      expect(octets, `${asset.fichier} depasse le plafond de sa categorie`).toBeLessThan(plafond);
    });
  }

  it('reste dans une enveloppe totale compatible avec un chargement a la demande', () => {
    const total = ASSETS.reduce(
      (somme, asset) => somme + statSync(resolve(RACINE, asset.fichier)).size,
      0,
    );
    // Ces fichiers ne sont jamais dans le chargement initial, mais ils doivent
    // rester telechargeables sur une connexion ordinaire.
    expect(Math.round(total / 1024)).toBeLessThan(3000);
  });
});

describe('licences', () => {
  it('chaque modele porte une licence, un auteur et une source verifiable', () => {
    for (const asset of ASSETS) {
      expect(asset.licence.id, asset.id).toMatch(/\S/);
      expect(asset.licence.auteur, asset.id).toMatch(/\S/);
      expect(asset.licence.source, asset.id).toMatch(/^https?:\/\//);
    }
  });

  it('n admet que des licences explicitement compatibles', () => {
    const admises = new Set(['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0']);
    for (const asset of ASSETS) {
      expect(admises.has(asset.licence.id), `${asset.id} : ${asset.licence.id}`).toBe(true);
    }
  });

  it('regroupe les licences pour la page d attribution', () => {
    const groupes = licences();
    expect(groupes.length).toBeGreaterThan(0);
    expect(groupes.reduce((total, groupe) => total + groupe.assets.length, 0)).toBe(ASSETS.length);
  });
});

describe('echelle declaree', () => {
  it('donne a chaque objet une hauteur plausible pour ce qu il est', () => {
    for (const asset of ASSETS) {
      expect(asset.hauteur, asset.id).toBeGreaterThan(0.005);
      expect(asset.hauteur, asset.id).toBeLessThan(4);
    }
    // Une personne doit passer sous une porte de deux metres trente-cinq.
    for (const personne of ASSETS.filter((a) => a.category === 'characters')) {
      expect(personne.hauteur, personne.id).toBeGreaterThan(1.5);
      expect(personne.hauteur, personne.id).toBeLessThan(2.1);
    }
  });
});
