// Descarga las ofertas destacadas de Aldi, Lidl, Rewe y Edeka vía marktguru.de,
// que las agrega en HTML servido desde servidor (sin JavaScript necesario).
// Las webs de los propios supermercados devuelven 403 a peticiones sin navegador.
import * as cheerio from 'cheerio'
import { writeFileSync } from 'node:fs'
import { categorize } from './categorize.mjs'

const CADENAS = [
  { slug: 'rewe', nombre: 'Rewe' },
  { slug: 'lidl', nombre: 'Lidl' },
  { slug: 'aldi-sued', nombre: 'Aldi' },
  { slug: 'edeka', nombre: 'Edeka' },
]

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function parsePrecio(texto) {
  // "€ 1,99" -> 1.99
  const m = texto.replace(/\s/g, '').match(/([\d.,]+)/)
  if (!m) return null
  return Number(m[1].replace('.', '').replace(',', '.'))
}

async function scrapeCadena({ slug, nombre }) {
  const res = await fetch(`https://www.marktguru.de/r/${slug}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de-DE,de;q=0.9' },
  })
  if (!res.ok) throw new Error(`${nombre}: HTTP ${res.status}`)

  const $ = cheerio.load(await res.text())
  const items = []

  $('li.offer-list-item').each((_, el) => {
    const nombreProducto = $(el).find('h3').first().text().trim()
    // Dentro de la tarjeta hay ".price" tanto en la etiqueta ("Preis:") como en
    // el valor: el valor real es el <span class="price"> anidado en la burbuja.
    const precioTexto = $(el).find('span.price').first().text().trim()
    const precio = parsePrecio(precioTexto)
    const validez = $(el).find('dd.valid').first().text().trim() || null
    if (!nombreProducto || precio == null) return

    items.push({
      supermarket: nombre,
      name: nombreProducto,
      price: precio,
      category: categorize(nombreProducto),
      ...(validez ? { valid: validez } : {}),
    })
  })

  return items
}

async function main() {
  const resultados = []
  const errores = []

  for (const cadena of CADENAS) {
    try {
      const items = await scrapeCadena(cadena)
      console.log(`${cadena.nombre}: ${items.length} ofertas`)
      resultados.push(...items)
    } catch (e) {
      console.error(`${cadena.nombre}: ERROR — ${e.message}`)
      errores.push({ supermarket: cadena.nombre, error: e.message })
    }
  }

  if (resultados.length === 0) {
    // Ni una cadena respondió: no sobrescribimos ofertas.json con un archivo
    // vacío, para que la app siga mostrando la última semana válida.
    console.error('Ninguna cadena devolvió datos. No se actualiza ofertas.json.')
    process.exit(1)
  }

  const salida = {
    updatedAt: new Date().toISOString(),
    source: 'marktguru.de',
    items: resultados,
    ...(errores.length ? { partialErrors: errores } : {}),
  }

  writeFileSync('ofertas.json', JSON.stringify(salida, null, 2))
  console.log(`\nTotal: ${resultados.length} ofertas guardadas en ofertas.json`)

  if (errores.length) {
    console.log(`Aviso: ${errores.length} cadena(s) fallaron esta vez, se mantienen las demás.`)
  }
}

main()
