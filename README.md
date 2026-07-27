# fitapp-ofertas

Scraper semanal de ofertas de Aldi, Lidl, Rewe y Edeka para [FitApp](https://github.com/carlalopezaijon1).

## Cómo funciona

Los propios sitios de los supermercados bloquean peticiones automatizadas (403).
En su lugar, este scraper usa [marktguru.de](https://www.marktguru.de), que
agrega las ofertas destacadas de las cuatro cadenas en HTML servido desde el
servidor — no hace falta navegador ni JavaScript para leerlo.

Un [workflow de GitHub Actions](.github/workflows/scrape.yml) corre cada lunes
por la mañana, descarga las ofertas y las guarda en `ofertas.json` en este
mismo repositorio. La app las lee directamente desde:

```
https://raw.githubusercontent.com/carlalopezaijon1/fitapp-ofertas/main/ofertas.json
```

## Limitaciones (léelas antes de confiar ciegamente en esto)

- Son las ofertas **destacadas** de cada cadena (~14 por semana), no el
  folleto completo con cientos de productos.
- La categoría de cada producto (carnes, verduras...) se asigna por palabras
  clave en alemán, no viene del propio sitio — puede fallar con nombres poco
  habituales.
- Si marktguru cambia el HTML de su web, el scraper deja de encontrar
  productos. El job no sobrescribe `ofertas.json` si no consigue leer
  ninguna cadena, así que en el peor caso la app se queda con los datos de la
  semana anterior en vez de quedarse sin nada.
- Si solo fallan una o dos cadenas (no las cuatro), se publican las que sí
  funcionaron y se anota el fallo en `partialErrors`.

## Ejecutar a mano

```bash
npm install
node scrape.mjs
```

O desde GitHub: pestaña **Actions** → "Actualizar ofertas semanales" → **Run workflow**.
