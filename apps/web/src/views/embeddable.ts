/**
 * Un ecran integrable peut apparaitre seul, avec son titre, ou dans un
 * ensemble qui fournit deja le sien. Sans ce reglage, l espace d apprentissage
 * empilerait deux titres de premier niveau sur la meme page.
 */
export interface EmbeddableViewProps {
  embedded?: boolean;
}
