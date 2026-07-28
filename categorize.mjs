// Clasifica una oferta de marktguru en una sección de FitApp.
//
// marktguru ya trae una categoría propia por oferta ("Käse", "Wurzelgemüse"…),
// con su `parentId` dentro de un árbol de unas 550 categorías. Clasificar por
// ese parentId es bastante más fiable que adivinar con palabras clave sobre el
// nombre del producto, que es lo que hacía la versión anterior: "Frischkäse-
// zubereitung mit Radieschen" caía en 'otros' aunque marktguru ya sabía que
// era queso.
//
// Un parentId cubre de golpe todas sus hojas, incluidas las que no hemos visto
// nunca — así el clasificador no se queda corto cuando el folleto de la semana
// trae un producto de un tipo nuevo.

/** parentId de marktguru -> sección de FitApp. Lo que no esté aquí no es comida. */
const POR_PADRE = {
  101: 'frescos', // hierbas, setas
  147: 'frescos', // verdura
  149: 'frescos', // fruta
  103: 'carnes',
  106: 'pescado',
  104: 'embutidos',
  107: 'lacteos',
  191: 'panaderia', // pan y panecillos
  23: 'panaderia', // bollería
  116: 'despensa', // arroz
  110: 'despensa', // harina, azúcar, repostería (mezcla postres: ver EXCEPCIONES)
  119: 'desayuno', // cereales y muesli
  193: 'desayuno', // café
  473: 'desayuno', // mermelada, miel, cremas dulces de untar
  113: 'conservas',
  120: 'congelados',
  108: 'condimentos', // aceites, salsas, vinagres, dips
  174: 'condimentos', // especias
  187: 'condimentos', // untables salados
  112: 'preparados',
  115: 'preparados', // ensaladas y antipasti de charcutería
  16: 'preparados', // veganos (mezcla pasta seca: ver EXCEPCIONES)
  20: 'dulces',
  102: 'dulces', // snacks salados: patatas fritas, frutos secos, aperitivos
  69: 'bebidas',
  70: 'alcohol', // cerveza
  363: 'alcohol', // vino
  364: 'alcohol', // licores y destilados
  454: 'alcohol', // ron
  497: 'alcohol', // cava y champán
}

/**
 * Hojas que su padre coloca mal. Dos casos reales vistos en los folletos:
 * - p110 mezcla repostería (harina, azúcar) con postres lácteos ("Grand Dessert").
 * - p16 mezcla productos veganos con pasta seca ("Genuss Pur Pasta").
 *
 * Hay además padres de temporada (p630: Vatertag, Xmas, Nikolaus) que agrupan
 * regalos y comida a la vez. Ésos no se mapean por padre a propósito: se
 * resuelven solos porque la oferta suele traer también su categoría real
 * ("Bier", "Schokoladen"), y classify() recorre todas.
 */
const EXCEPCIONES = {
  Desserts: 'dulces',
  Nudeln: 'despensa',
  'Eier-Teigwaren': 'despensa',
  Reis: 'despensa',
  Honig: 'desayuno',
  Kakao: 'bebidas',
}

/**
 * Sección de FitApp para una oferta, o null si no es comida.
 *
 * `categories` es la lista que trae la oferta de marktguru; una misma oferta
 * puede llevar varias ("Vatertag" + "Bier"). Se recorren todas y gana la
 * primera que sepamos clasificar, de modo que una cerveza etiquetada además
 * como regalo del Día del Padre acabe en 'alcohol' y no descartada por no-comida.
 */
export function classify(categories) {
  for (const c of categories ?? []) {
    const porNombre = EXCEPCIONES[c?.name]
    if (porNombre) return porNombre
  }
  for (const c of categories ?? []) {
    const porPadre = POR_PADRE[c?.parentId]
    if (porPadre) return porPadre
  }
  return null
}

// ---------------------------------------------------------------------------
// Respaldo por palabras clave, sólo para las cadenas que no están en el feed de
// la API y hay que raspar de su página HTML (Aldi). Ahí no hay categoría, así
// que toca adivinar por el nombre del producto, con lo que eso implica: es
// deliberadamente conservador y devuelve null ante la duda, porque en esa vía
// un falso positivo mete champú entre las verduras y nadie lo corrige después.

// Diéresis normalizadas (ü→ue, ö→oe, ä→ae, ß→ss): así "Würstchen" coincide con
// el patrón "wuerst" sin escribir cada variante con y sin diéresis.
function normalizeDE(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .replace(/ü/g, 'ue')
    .replace(/ö/g, 'oe')
    .replace(/ä/g, 'ae')
    .replace(/ß/g, 'ss')
}

const REGLAS_NOMBRE = [
  [/lachs|fisch|thunfisch|garnelen|krabben|forelle|hering|kabeljau|dorade|scampi|meeresfruechte|makrele/, 'pescado'],
  [/w(u|ue)rst|schinken|speck|salami|aufschnitt|lyoner|mett\b/, 'embutidos'],
  [/haehnchen|huehn|gefluegel|pute|truthahn|schwein|rind\b|lamm|fleisch|hack\b|steak|frikadelle|schnitzel|filet/, 'carnes'],
  [/tiefkuehl|tiefgefroren|\beis\b|eiscreme|frost/, 'congelados'],
  [/milch|joghurt|quark|kaese|butter|sahne|mozzarella|feta|eier\b|gouda|edamer|emmentaler|camembert|brie\b|skyr/, 'lacteos'],
  [/brot|broetchen|toast|baguette|croissant|sauerteig|kuchen|geback/, 'panaderia'],
  [/muesli|haferflocken|cornflakes|cerealien|kaffee|marmelade|fruchtaufstrich|honig|nutella/, 'desayuno'],
  [/nudeln|pasta|spaghetti|reis\b|mehl|zucker|linsen|kichererbsen/, 'despensa'],
  [/dose|konserve|bohnen|mais\b/, 'conservas'],
  [/oel\b|olivenoel|essig|senf|gewuerz|sauce|sosse|ketchup|mayonnaise|pesto|dip\b/, 'condimentos'],
  [/schokolade|keks|bonbon|gummi|chips|nuesse|erdnuesse|mandeln|cashew|walnuesse|snack/, 'dulces'],
  [/bier\b|pils|weizen/, 'alcohol'],
  [/wein\b|sekt|prosecco|whisky|whiskey|wodka|\brum\b|likoer|gin\b/, 'alcohol'],
  // Las bebidas van ANTES que la fruta a propósito: media bebida alemana lleva
  // el nombre de una fruta ("Apfelsaft", "Orangenlimonade") y si no, un zumo de
  // manzana acaba listado entre las frutas y verduras frescas.
  [/wasser|saft\b|limonade|cola\b|schorle|eistee|nektar/, 'bebidas'],
  [/apfel|aepfel|birne|banane|orange|zitrone|limette|beeren|himbeere|erdbeere|heidelbeere|trauben|melone|pfirsich|kirsche|pflaume|aprikose|ananas|kiwi|obst|gemuese|salat|tomate|gurke|paprika|zwiebel|knoblauch|kartoffel|karotte|moehre|zucchini|brokkoli|spinat|pilze|avocado|rucola/, 'frescos'],
]

/** Sección de FitApp adivinada por el nombre, o null si no parece comida. */
export function classifyByName(nombre) {
  const texto = normalizeDE(nombre)
  for (const [patron, seccion] of REGLAS_NOMBRE) {
    if (patron.test(texto)) return seccion
  }
  return null
}
