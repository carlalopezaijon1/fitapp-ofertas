// Clasifica productos alemanes en categorías de supermercado, por palabras clave.
// Mismo criterio que usa FitApp para la lista de la compra (ver ingredientCatalog.js),
// pero aquí en alemán porque el nombre del producto viene tal cual de la oferta.

// Diéresis normalizadas (ü→ue, ö→oe, ä→ae, ß→ss): así "Würstchen" coincide con
// el patrón "wuerst" sin tener que escribir cada variante con y sin diéresis.
function normalizeDE(texto) {
  return texto
    .toLowerCase()
    .replace(/ü/g, 'ue')
    .replace(/ö/g, 'oe')
    .replace(/ä/g, 'ae')
    .replace(/ß/g, 'ss')
}

const RULES = [
  [/haehnchen|huehn|gefluegel|pute|truthahn|schwein|rind\b|beef|lamm|w(u|ue)rst|schinken|speck|salami|fleisch|hack(fleisch)?\b|steak|frikadelle|schaschlik|mett\b|filet(?!.*fisch)/, 'carnes'],
  [/lachs|fisch|thunfisch|garnelen|krabben|forelle|hering|kabeljau|dorade|scampi|meeresfruechte/, 'carnes'],
  [/milch|joghurt|quark|kaese|butter|sahne|frischkaese|mozzarella|feta|\bei\b|eier\b|gouda|edamer|maasdamer|emmentaler|camembert|brie\b|bergkaese/, 'lacteos'],
  [/tiefkuehl|tiefgefroren|gefroren|\beis\b|frost/, 'congelados'],
  [/brot|broetchen|toast|baguette|vollkorn|muesli|haferflocken|cornflakes|nudeln|pasta|reis\b|mehl|couronne|croissant|sauerteig|steinofen|kruste/, 'panaderia'],
  [/dose|konserve|glas\b|bohnen|linsen|kichererbsen|mais\b/, 'conservas'],
  [/oel\b|olivenoel|essig|senf|honig|gewuerz|sauce|sosse|ketchup|mayonnaise/, 'condimentos'],
  [/nuesse|erdnuesse|mandeln|cashew|walnuesse|samen|kerne/, 'otros'],
  [/apfel|birne|banane|orange|zitrone|limette|beeren|himbeere|erdbeere|heidelbeere|trauben|melone|wassermelone|pfirsich|kirsche|pflaume|zwetschge|aprikose|ananas|kiwi|obst|gemuese|salat|tomate|gurke|paprika|zwiebel|knoblauch|kartoffel|karotte|moehre|zucchini|brokkoli|spinat|pilze|avocado/, 'verduras'],
]

export function categorize(nombre) {
  const texto = normalizeDE(nombre)
  for (const [patron, categoria] of RULES) {
    if (patron.test(texto)) return categoria
  }
  return 'otros'
}
