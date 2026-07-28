# fitapp-ofertas

Scraper semanal de ofertas de supermercado para [FitApp](https://github.com/carlalopezaijon1).

## Cómo funciona

Los propios sitios de los supermercados bloquean peticiones automatizadas (403),
así que todo pasa por [marktguru.de](https://www.marktguru.de), que agrega los
folletos de las cadenas. Hay dos vías:

1. **API JSON de marktguru** (`api.marktguru.de`) — la fuente principal. Devuelve
   el folleto **completo** de la semana para un código postal: unas 300 ofertas
   por cadena, cada una con su categoría oficial, su precio por kilo o litro y su
   gramaje. Es la misma API que usa su web; la clave va incrustada en el HTML de
   marktguru.de y no es secreta.
2. **Página HTML de la cadena** (`marktguru.de/r/<slug>`) — respaldo para cadenas
   que no aparecen en el feed de la API. Sólo trae ~24 destacados y sin categoría.

Un [workflow de GitHub Actions](.github/workflows/scrape.yml) corre cada lunes
por la mañana, descarga las ofertas y las guarda en `ofertas.json` en este mismo
repositorio. La app las lee directamente desde:

```
https://raw.githubusercontent.com/carlalopezaijon1/fitapp-ofertas/main/ofertas.json
```

## Código postal

**Las ofertas de folleto son regionales.** El mismo código postal decide qué
cadenas aparecen y a qué precio: Berlín y Hamburgo devuelven catálogos distintos,
y Edeka sólo sale en algunas zonas.

Se configura con la variable `FITAPP_ZIP`, en
**Settings → Secrets and variables → Actions → Variables**. Para probar en local:

```bash
FITAPP_ZIP=20095 node scrape.mjs
```

## Limitaciones (léelas antes de confiar ciegamente en esto)

- **Aldi no publica en marktguru.** No aparece en el feed de la API en ninguna
  región, y su página de destacados sirve folletos caducados (se han visto de
  hace un mes). El scraper descarta por fecha lo que ya no vale, así que en la
  práctica de Aldi no sale nada. No es un fallo del scraper: el dato no existe.
- La clasificación en secciones sale del árbol de categorías de marktguru, que es
  suyo y puede cambiar. Los `parentId` que se usan están en `categorize.mjs`; lo
  que no reconoce se descarta por no considerarse comida.
- Para la vía HTML no hay categoría y se adivina por palabras clave sobre el
  nombre del producto, con lo que eso implica.
- Si marktguru cambia su API o su HTML, el scraper deja de encontrar productos.
  El job no sobrescribe `ofertas.json` si no consigue leer nada, así que en el
  peor caso la app se queda con los datos de la semana anterior.
- Si sólo falla una fuente, se publica lo que sí funcionó y se anota el fallo en
  `partialErrors`.

## Formato de `ofertas.json`

```jsonc
{
  "updatedAt": "2026-07-28T06:00:00.000Z",
  "source": "marktguru.de",
  "zipCode": "20095",
  "items": [
    {
      "id": "24159868",        // id de marktguru, único: la app lo usa como key
      "supermarket": "Rewe",
      "name": "Hähnchen-Innenbrustfilets",
      "brand": "Wiesenhof",    // ausente si el producto no tiene marca
      "price": 4.99,
      "oldPrice": 6.99,        // ausente si no hay precio tachado
      "unitPrice": 12.47,      // precio por unidad de referencia
      "unit": "kg",
      "detail": "je 400-g-Pckg.",
      "section": "carnes",     // sección de FitApp, ver categorize.mjs
      "categoryDE": "Geflügel",
      "validFrom": "2026-07-26T22:00:00Z",
      "validTo": "2026-08-01T21:59:00Z"
    }
  ]
}
```

Las claves nulas se omiten: con más de mil ofertas, los nulos pesaban de más.

## Ejecutar a mano

```bash
npm install
FITAPP_ZIP=20095 node scrape.mjs
```

O desde GitHub: pestaña **Actions** → "Actualizar ofertas semanales" → **Run workflow**.
