// Descarga las ofertas semanales de supermercado vía marktguru.de.
//
// Dos fuentes, porque no todas las cadenas publican igual:
//
//  1. API JSON de marktguru (api.marktguru.de). Devuelve el folleto COMPLETO
//     de la semana para un código postal, no los destacados: unas 250-350
//     ofertas por cadena, con categoría oficial, precio por kilo/litro y
//     gramaje. Es la que usa su propia web; la clave va incrustada en el HTML
//     de marktguru.de, no es secreta.
//
//  2. Página HTML de la cadena (marktguru.de/r/<slug>), como respaldo para las
//     cadenas que no aparecen en el feed de la API. Aldi es el caso: no
//     sindica sus ofertas al feed en ninguna región, así que de Aldi sólo se
//     pueden sacar los ~24 destacados que renderiza su página.
//
// Las webs de los propios supermercados devuelven 403 a peticiones sin navegador,
// por eso se pasa por marktguru en ambos casos.
import * as cheerio from 'cheerio'
import { writeFileSync } from 'node:fs'
import { classify, classifyByName } from './categorize.mjs'

// Las ofertas de folleto son regionales: el mismo código postal decide qué
// cadenas aparecen y con qué precios. Berlín y Hamburgo devuelven catálogos
// distintos, y Edeka sólo sale en algunas zonas.
const ZIP = process.env.FITAPP_ZIP || '20095'

// Nombre en marktguru -> nombre que enseña FitApp. Varias entradas pueden caer
// en la misma cadena ("REWE" y "REWE Center" son el mismo súper para la compra).
const CADENAS_API = {
  REWE: 'Rewe',
  'REWE Center': 'Rewe',
  Lidl: 'Lidl',
  EDEKA: 'Edeka',
  'EDEKA Frischemarkt': 'Edeka',
  PENNY: 'Penny',
}

// Cadenas ausentes del feed, que hay que raspar de su página de destacados.
const CADENAS_HTML = [{ slug: 'aldi-nord', nombre: 'Aldi' }]

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const CABECERAS_API = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'de-DE,de;q=0.9',
  Accept: 'application/json',
  'x-apikey': '8Kk+pmbf7TgJ9nVj2cXeA7P5zBGv8iuutVVMRfOfvNE=',
  'x-clientkey': 'WU/RH+PMGDi+gkZer3WbMelt6zcYHSTytNB7VpTia90=',
  'x-apiversion': '1',
}

const PAGINA = 500 // máximo que acepta el endpoint por petición

/** Redondea a céntimos; los precios por kilo vienen con más decimales. */
const céntimos = (n) => (typeof n === 'number' && isFinite(n) ? Math.round(n * 100) / 100 : null)

// marktguru rellena la marca con este literal cuando la oferta no tiene marca
// (producto a granel, marca blanca). Dejarlo pasar pinta "[thisisnobrand123]"
// al lado de cada tomate.
const SIN_MARCA = /^thisisnobrand/i
const marca = (n) => {
  const t = n?.trim()
  return t && !SIN_MARCA.test(t) ? t : null
}

/** Quita las claves nulas: con ~1000 ofertas, los nulos pesan de más en el JSON. */
const sinNulos = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null))

async function pedirPagina(offset) {
  const url = `https://api.marktguru.de/api/v1/offers?as=web&limit=${PAGINA}&offset=${offset}&zipCode=${ZIP}`
  const res = await fetch(url, { headers: CABECERAS_API })
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  return res.json()
}

/**
 * Recorre el feed entero del código postal. Devuelve sólo las ofertas de las
 * cadenas que nos interesan, vigentes hoy y clasificadas como comida.
 */
async function scrapeApi() {
  const items = []
  let total = null
  let descartadasNoComida = 0

  for (let offset = 0; total === null || offset < total; offset += PAGINA) {
    const pagina = await pedirPagina(offset)
    total ??= pagina.totalResults
    if (!pagina.results?.length) break

    for (const o of pagina.results) {
      const cadena = CADENAS_API[o.advertisers?.[0]?.name]
      if (!cadena) continue

      const vigencia = (o.validityDates ?? [])[0]
      if (!vigencia) continue
      // El folleto de la semana que viene ya aparece en el feed unos días
      // antes; sin este filtro la app mezclaría precios que aún no valen.
      const ahora = Date.now()
      if (new Date(vigencia.to).getTime() < ahora) continue

      const section = classify(o.categories)
      if (!section) {
        descartadasNoComida++
        continue // muebles, droguería, ropa: fuera
      }

      const nombre = o.product?.name?.trim()
      const precio = céntimos(o.price)
      if (!nombre || precio == null) continue

      items.push(
        sinNulos({
          id: String(o.id),
          supermarket: cadena,
          name: nombre,
          brand: marca(o.brand?.name),
          price: precio,
          oldPrice: céntimos(o.oldPrice),
          unitPrice: céntimos(o.referencePrice),
          unit: o.unit?.shortName || null,
          detail: o.description?.trim() || null,
          section,
          categoryDE: o.categories?.[0]?.name || null,
          validFrom: vigencia.from,
          validTo: vigencia.to,
        })
      )
    }
  }

  console.log(`API (zip ${ZIP}): ${total} ofertas en el feed, ${items.length} de comida en mis cadenas`)
  console.log(`  descartadas por no ser comida: ${descartadasNoComida}`)
  return items
}

/** "€ 1,99" -> 1.99 */
function parsePrecio(texto) {
  const m = String(texto ?? '').replace(/\s/g, '').match(/([\d.,]+)/)
  if (!m) return null
  return Number(m[1].replace('.', '').replace(',', '.'))
}

/**
 * "21.06. - 27.06." -> fecha de fin, o null si no se entiende.
 *
 * La página no dice el año. Se asume el actual y, si eso deja la fecha muy en
 * el futuro, se retrocede uno: en diciembre un folleto "28.12. - 03.01." tiene
 * el final en enero del año siguiente, no del mismo.
 */
function parseFinValidez(texto, hoy = new Date()) {
  const m = String(texto ?? '').match(/(\d{1,2})\.(\d{1,2})\.\s*$/) ??
    String(texto ?? '').match(/-\s*(\d{1,2})\.(\d{1,2})\./)
  if (!m) return null
  const [, dia, mes] = m
  let fin = new Date(hoy.getFullYear(), Number(mes) - 1, Number(dia), 23, 59, 59)
  if (fin.getTime() - hoy.getTime() > 200 * 86_400_000) fin.setFullYear(fin.getFullYear() - 1)
  return fin
}

/**
 * Respaldo para cadenas fuera del feed. La página sólo trae destacados y sin
 * categoría, así que aquí sí toca clasificar por el nombre del producto.
 */
async function scrapeHtml({ slug, nombre }) {
  const res = await fetch(`https://www.marktguru.de/r/${slug}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de-DE,de;q=0.9' },
  })
  if (!res.ok) throw new Error(`${nombre}: HTTP ${res.status}`)

  const $ = cheerio.load(await res.text())
  const items = []
  const hoy = new Date()
  let caducadas = 0

  $('li.offer-list-item').each((_, el) => {
    const nombreProducto = $(el).find('h3').first().text().trim()
    // Dentro de la tarjeta hay ".price" tanto en la etiqueta ("Preis:") como en
    // el valor: el valor real es el <span class="price"> anidado en la burbuja.
    const precio = parsePrecio($(el).find('span.price').first().text())
    if (!nombreProducto || precio == null) return

    // Esta página no se refresca con la fiabilidad del feed: se ha visto
    // sirviendo el folleto del mes pasado. Un precio caducado es peor que no
    // tener precio, así que se descarta.
    const validez = $(el).find('dd.valid').first().text().trim()
    const fin = parseFinValidez(validez, hoy)
    if (fin && fin < hoy) {
      caducadas++
      return
    }

    const section = classifyByName(nombreProducto)
    if (!section) return

    items.push(
      sinNulos({
        id: `${slug}-${items.length}`,
        supermarket: nombre,
        name: nombreProducto,
        price: precio,
        section,
        validTo: fin ? fin.toISOString() : null,
      })
    )
  })

  console.log(
    `HTML (${nombre}): ${items.length} destacados de comida` +
      (caducadas ? ` (${caducadas} descartadas por caducadas)` : '')
  )
  return items
}

/**
 * Misma oferta repetida en varios folletos de la misma cadena: se queda una.
 *
 * La clave ignora la marca a propósito. El mismo producto aparece a veces dos
 * veces, una con marca y otra sin ella ("Putenschnitzel" a 1,29 € en Edeka, con
 * y sin "Gutfleisch"), y en la lista se leen como una fila repetida. Gana la
 * versión con más información, que es la que dice algo útil.
 */
function deduplicar(items) {
  const vistos = new Map()
  for (const o of items) {
    const clave = `${o.supermarket}|${o.name}|${o.price}`
    const previa = vistos.get(clave)
    if (!previa || informacion(o) > informacion(previa)) vistos.set(clave, o)
  }
  return [...vistos.values()]
}

const informacion = (o) => (o.brand ? 1 : 0) + (o.detail ? 1 : 0) + (o.unitPrice ? 1 : 0)

async function main() {
  const resultados = []
  const errores = []

  try {
    resultados.push(...(await scrapeApi()))
  } catch (e) {
    console.error(`API: ERROR — ${e.message}`)
    errores.push({ source: 'api', error: e.message })
  }

  for (const cadena of CADENAS_HTML) {
    try {
      resultados.push(...(await scrapeHtml(cadena)))
    } catch (e) {
      console.error(`${cadena.nombre}: ERROR — ${e.message}`)
      errores.push({ supermarket: cadena.nombre, error: e.message })
    }
  }

  if (resultados.length === 0) {
    // Ninguna fuente respondió: no sobrescribimos ofertas.json con un archivo
    // vacío, para que la app siga mostrando la última semana válida.
    console.error('Ninguna fuente devolvió datos. No se actualiza ofertas.json.')
    process.exit(1)
  }

  const items = deduplicar(resultados).sort(
    (a, b) => a.supermarket.localeCompare(b.supermarket) || a.price - b.price
  )

  const salida = {
    updatedAt: new Date().toISOString(),
    source: 'marktguru.de',
    zipCode: ZIP,
    items,
    ...(errores.length ? { partialErrors: errores } : {}),
  }

  // Sin indentar: son ~1000 ofertas que la app se descarga y guarda en el
  // móvil, y la sangría sola pesaba casi tanto como los datos.
  writeFileSync('ofertas.json', JSON.stringify(salida))

  const porCadena = {}
  const porSeccion = {}
  for (const o of items) {
    porCadena[o.supermarket] = (porCadena[o.supermarket] ?? 0) + 1
    porSeccion[o.section] = (porSeccion[o.section] ?? 0) + 1
  }
  console.log(`\nTotal: ${items.length} ofertas guardadas en ofertas.json`)
  console.log('Por cadena:', porCadena)
  console.log('Por sección:', porSeccion)

  if (errores.length) {
    console.log(`Aviso: ${errores.length} fuente(s) fallaron esta vez, se mantienen las demás.`)
  }
}

main()
