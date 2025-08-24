// src/lib/pcs.ts
import axios from "axios";
import * as cheerio from "cheerio";

export interface StageResult {
  Stage: number;
  Rank: number;
  Rider: string;
  Team: string;
  Time: string;
  Gaps?: string;
  PCS_Rider_URL: string;
  BreakawayIcon: boolean;
  Notes?: string;
}

const PCS_BASE = "https://www.procyclingstats.com";
const DEBUG = true;

/** URL de etapa Vuelta 2024 */
export function buildVuelta2024StageUrl(stage: number): string {
  return `${PCS_BASE}/race/vuelta-a-espana/2024/stage-${stage}`;
}

/** Descarga HTML con UA decente */
export async function fetchStageHTML(url: string): Promise<string> {
  const { data } = await axios.get(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
    timeout: 20000,
  });
  return data as string;
}

/** Utils */
function textOf($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, " ").trim();
}
function looksLikeTime(s: string): boolean {
  return /[:]/.test(s) || /^\+/.test(s) || /^s\.?t\.?$/i.test(s) || /^st$/i.test(s);
}
function absUrl(href: string | undefined): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) href = "/" + href;
  return PCS_BASE + href;
}
function esc(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function teamWordTokens(team: string): string[] {
  if (!team) return [];
  const m = team.match(/[\p{L}\p{N}]+/giu);
  return (m || []).map((t) => t.toLowerCase());
}

/** Elimina rastro del team cuando aparece pegado al Rider */
function stripTeamTrail(riderTxt: string, team: string): string {
  if (!riderTxt || !team) return riderTxt;
  const tokens = teamWordTokens(team);
  if (!tokens.length) return riderTxt;

  const SEP = String.raw`[\s\-–—|·•]*`;
  let out = riderTxt;
  let changed = true;
  while (changed) {
    changed = false;
    for (let n = tokens.length; n >= 1; n--) {
      const prefix = tokens.slice(0, n).map(esc).join(SEP);
      const re = new RegExp(String.raw`${SEP}(?:${prefix})(?:${SEP}[\-–—|·•]*)?$`, "iu");
      const trimmed = out.replace(re, "").replace(/\s{2,}/g, " ").trim();
      if (trimmed !== out) {
        out = trimmed;
        changed = true;
        break;
      }
    }
  }
  return out;
}

function cleanRiderName(raw: string, team: string): string {
  let out = raw;
  out = out.replace(/\b[a-z]{2,}_[a-z0-9_]{2,}\b/gi, " ");
  out = out.replace(/[|•·]+/g, " ");
  if (team) {
    const spaced = team;
    const tight = team.replace(/\s+/g, "");
    out = out.replace(spaced, " ");
    out = out.replace(tight, " ");
    out = stripTeamTrail(out, team);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function getRiderCellCleanText($: cheerio.CheerioAPI, $cell: cheerio.Cheerio<any>): string {
  const $clone = $cell.clone();
  $clone.find('a[href*="/team/"]').remove();
  $clone.find('[class*="team"]').remove();
  $clone
    .find(
      [
        ".fav",
        ".badge",
        ".label",
        ".tag",
        ".icon",
        ".pcs-icon",
        ".pcsIcon",
        ".rider-icon",
        "img",
        "svg",
        "use",
      ].join(",")
    )
    .remove();

  $clone.find("small, span, i, em, b").each((_i, el) => {
    const s = textOf($(el));
    if (/\b[a-z]{2,}_[a-z0-9_]{2,}\b/i.test(s)) $(el).remove();
  });

  let txt = textOf($clone);
  txt = txt.replace(/\b[a-z]{2,}_[a-z0-9_]{2,}\b/gi, " ");
  return txt.replace(/\s{2,}/g, " ").trim();
}

/** Localiza la tabla principal de resultados */
function findResultsTable($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null {
  let best: cheerio.Cheerio<any> | null = null;
  $("table").each((_i, el) => {
    const $t = $(el);
    const head = $t.find("thead th").map((_j, th) => textOf($(th))).get();
    if (!head.length) return;
    const hasRider = head.some((h) => /rider|name/i.test(h));
    const hasPos = head.some((h) => /(pos|rank|#)/i.test(h));
    if (hasRider && hasPos) best = $t;
  });
  if (best) return best;

  const alt = $('div.result-cont table, table.results, table.basic');
  if (alt.length) return alt.first();

  let fallback: cheerio.Cheerio<any> | null = null;
  $("table").each((_i, el) => {
    const $t = $(el);
    if ($t.find('a[href*="/rider/"]').length > 0) {
      fallback = $t;
      return false;
    }
  });
  return fallback;
}

function mapHeaderIndexes($: cheerio.CheerioAPI, $table: cheerio.Cheerio<any>) {
  const head = $table.find("thead th").map((_i, th) => textOf($(th))).get();
  const getIdx = (alts: RegExp[]) => {
    for (let i = 0; i < head.length; i++) {
      const h = head[i];
      if (alts.some((re) => re.test(h))) return i;
    }
    return -1;
  };
  return {
    posIdx: getIdx([/(pos|rank|#)/i]),
    riderIdx: getIdx([/rider/i, /name/i]),
    teamIdx: getIdx([/team/i]),
    timeIdx: getIdx([/time/i, /gap/i]),
  };
}

/** Palabras clave multi-idioma para “fuga/escapada/breakaway” */
const BRK_WORDS = [
  "breakaway",
  "break",
  "in break",
  "escape",
  "escap",
  "fuga",
  "échapp",
  "fugg", // it: fuga/fuggito
  "brk",
];

/** Busca si una cadena contiene alguna palabra clave */
function hasBrkWord(s: string): boolean {
  const low = s.toLowerCase();
  return BRK_WORDS.some((w) => low.includes(w));
}

/** Detección SIMPLE del escudo de fuga (svg_shield) */
function hasShieldIcon($tr: cheerio.Cheerio<any>): boolean {
  // En PCS el indicador de escapada aparece como <div class="svg_shield" ...>
  // Normalmente vive dentro de la celda de "ridername", pero buscamos en toda la fila por robustez.
  if ($tr.find(".svg_shield").length > 0) return true;
  // Por si el título describe la fuga aunque falte la clase (muy raro)
  const titleHit = $tr
    .find('[title],[aria-label],[data-title],[data-tooltip],[data-original-title]')
    .toArray()
    .some((n) => {
      const t =
        (n as any).attribs?.title ||
        (n as any).attribs?.["aria-label"] ||
        (n as any).attribs?.["data-title"] ||
        (n as any).attribs?.["data-tooltip"] ||
        (n as any).attribs?.["data-original-title"] ||
        "";
      return hasBrkWord(String(t));
    });
  return titleHit;
}

/** Heurística “inline” (mantiene compat) + atajo svg_shield */
function hasBreakawayIconInline($tr: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): boolean {
  // 🔴 Atajo directo y fiable para PCS:
  if (hasShieldIcon($tr)) return true;

  // Compatibilidad con otras carreras/tablas si PCS cambiase el nombre de clase:
  const classSelectors = [
    ".breakaway",
    ".break-away",
    ".breakaway-icon",
    ".pcs-icon-breakaway",
    ".pcsIcon.breakaway",
    ".ico-breakaway",
    ".icon-breakaway",
    ".icon_breakaway",
    ".tag-breakaway",
    ".tag--breakaway",
    ".is-breakaway",
    '[class*="breakaway"]',
    '[class*="break-away"]',
    '[class*="escap"]',
    '[class*="fuga"]',
    '[class*="brk"]',
    '[class*="ico"]',
  ].join(",");
  if ($tr.find(classSelectors).length > 0) return true;

  const chip = $tr
    .find(".tag, .label, .badge, small, span, i, b, em")
    .toArray()
    .some((el) => /^(BRK|Brk|BR|Esc|ESC|E)$/.test(($(el).text() || "").trim()));
  if (chip) return true;

  const attrHit = $tr
    .find("*")
    .toArray()
    .some((node) => {
      const $n = $(node);
      const bag =
        ($n.attr("title") ||
          $n.attr("aria-label") ||
          $n.attr("data-title") ||
          $n.attr("data-tooltip") ||
          $n.attr("data-original-title") ||
          $n.attr("data-icon") ||
          "") + "";
      return bag ? hasBrkWord(bag) : false;
    });
  if (attrHit) return true;

  const styleHit = $tr
    .find("span, i, em, b, div")
    .toArray()
    .some((node) => {
      const $n: any = $(node);
      const style = ($n.attribs?.style || "").toLowerCase();
      if (!style) return false;
      const hasSprite =
        style.includes("background-position") ||
        style.includes("background-image") ||
        style.includes("mask-image");
      const hasSize =
        style.includes("width:") &&
        (style.includes("8px") ||
          style.includes("9px") ||
          style.includes("10px") ||
          style.includes("12px"));
      const looksLikeIcon =
        hasSprite || style.includes("display:inline-block") || style.includes("inline-block");
      return looksLikeIcon && (hasSize || hasSprite);
    });
  if (styleHit) return true;

  const imgOrSvg = $tr.find("img, svg, use, symbol, title, desc");
  const imgHit = imgOrSvg
    .toArray()
    .some((el) => {
      const $el = $(el);
      const src = (
        $el.attr("src") ||
        $el.attr("data-src") ||
        $el.attr("xlink:href") ||
        $el.attr("href") ||
        $el.attr("data-href") ||
        ""
      ).toLowerCase();
      const tt = ($el.text() || "").toLowerCase();
      return hasBrkWord(src) || /\bbrk\b/.test(src) || hasBrkWord(tt) || /\bbrk\b/.test(tt);
    });
  if (imgHit) return true;

  const plain = ($tr.text() || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (hasBrkWord(plain) || /\bbrk\b/.test(plain)) return true;

  const raw = ($tr.html() || "").toLowerCase();
  if (hasBrkWord(raw) || /\bbrk\b/.test(raw)) return true;

  return false;
}

/** Busca la sección complementaria de “Breakaway/Fuga” y devuelve SET de hrefs absolutos de riders */
function collectComplementaryBreakaway($: cheerio.CheerioAPI): Set<string> {
  const set = new Set<string>();

  // Headings
  const headings = $("h1, h2, h3, h4").filter((_i, el) =>
    /(breakaway|escape|fuga)/i.test(textOf($(el)))
  );

  const nearBy: cheerio.Cheerio<any>[] = [];
  headings.each((_i, el) => {
    const $h = $(el);
    const $container = $h.closest("section, article, div");
    if ($container.length) nearBy.push($container);
    let $sib = $h.next();
    for (let k = 0; k < 3 && $sib.length; k++) {
      nearBy.push($sib);
      $sib = $sib.next();
    }
  });

  // Marcados por id/clase/data
  const marked = $(
    '[id*="breakaway"], [class*="breakaway"], [data-section*="breakaway"], [data-tab*="breakaway"]'
  );
  marked.each((_i, el) => {
    nearBy.push($(el));
  });

  // Fallback por texto general en bloques
  if (nearBy.length === 0) {
    $("section, article, div").each((_i, el) => {
      const t = textOf($(el)).toLowerCase();
      if (/(breakaway|escape|fuga)/i.test(t)) {
        nearBy.push($(el));
      }
    });
  }

  const addRidersFrom = ($root: cheerio.Cheerio<any>) => {
    $root.find('a[href*="/rider/"]').each((_j, a) => {
      const href = absUrl($(a).attr("href"));
      if (href) set.add(href);
    });
  };

  nearBy.forEach(($root) => {
    addRidersFrom($root);
    $root
      .nextAll()
      .slice(0, 2)
      .each((_j, sib) => {
        addRidersFrom($(sib));
      });
  });

  if (DEBUG) {
    if (set.size > 0) {
      console.warn(`[breakaway:complementary] encontrados ${set.size} riders en sección`);
    } else {
      console.warn("[breakaway:complementary] no se encontró sección/lista de fuga");
    }
  }
  return set;
}

/** Parser principal */
export function parseStageResults(html: string, stage: number): StageResult[] {
  const $ = cheerio.load(html);

  // Complementario (puede no existir)
  const breakawaySet = collectComplementaryBreakaway($);

  // Tabla principal
  const $table = findResultsTable($);
  if (!$table || $table.length === 0) {
    throw new Error("No se encontró la tabla de resultados principales");
  }
  const { posIdx, riderIdx, teamIdx, timeIdx } = mapHeaderIndexes($, $table);

  const rows: StageResult[] = [];
  const $tbodyRows = $table.find("tbody tr");
  const iter = $tbodyRows.length ? $tbodyRows : $table.find("tr").not(":has(th)");

  iter.each((_i, tr) => {
    const parsed = parseRow($, $(tr), stage, { posIdx, riderIdx, teamIdx, timeIdx }, breakawaySet);
    if (parsed) rows.push(parsed);
  });

  return rows;
}

type HeaderMap = { posIdx: number; riderIdx: number; teamIdx: number; timeIdx: number };

function parseRow(
  $: cheerio.CheerioAPI,
  $tr: cheerio.Cheerio<any>,
  stage: number,
  idx: HeaderMap,
  complementaryBreakaway: Set<string>
): StageResult | null {
  const $tds = $tr.find("td");
  if ($tds.length === 0) return null;

  let rank: number | null = null;
  let riderUrl = "";
  let rider = "";
  let team = "";
  let time = "";

  const useHeaders = idx.riderIdx >= 0;

  if (useHeaders) {
    const posText = idx.posIdx >= 0 ? textOf($tds.eq(idx.posIdx)) : textOf($tds.eq(0));
    const r = parseInt(posText.replace(/\D+/g, ""), 10);
    if (!isNaN(r) && r > 0) rank = r;

    const $riderCell = $tds.eq(idx.riderIdx);
    const $riderLink = $riderCell.find('a[href*="/rider/"]').first();
    riderUrl = absUrl($riderLink.attr("href"));

    // TEAM
    if (idx.teamIdx >= 0) {
      const $teamCell = $tds.eq(idx.teamIdx);
      const $teamLink = $teamCell.find('a[href*="/team/"]').first();
      team = $teamLink.length ? textOf($teamLink) : textOf($teamCell);
    } else {
      const $teamInline = $riderCell.find('a[href*="/team/"], .team, small, span');
      if ($teamInline.length) team = textOf($teamInline.first());
    }

    // RIDER
    const riderRaw = getRiderCellCleanText($, $riderCell);
    rider = cleanRiderName(riderRaw, team);

    // TIME
    if (idx.timeIdx >= 0) {
      time = textOf($tds.eq(idx.timeIdx));
    } else {
      $tds.each((_i, td) => {
        const s = textOf($(td));
        if (!time && looksLikeTime(s)) time = s;
      });
    }
  } else {
    // Sin cabeceras
    const firstCell = textOf($tds.eq(0));
    const r = parseInt(firstCell.replace(/\D+/g, ""), 10);
    if (!isNaN(r) && r > 0) rank = r;

    const $riderLink = $tr.find('a[href*="/rider/"]').first(); // puede no existir (render JS)
    riderUrl = absUrl($riderLink.attr("href"));

    const $teamLink = $tr.find('a[href*="/team/"]').first();
    if ($teamLink.length) team = textOf($teamLink);
    else {
      const $teamInline = $tr
        .find(".team, small, span")
        .filter((_i, el) => /team/i.test($(el).attr("class") || ""));
      if ($teamInline.length) team = textOf($teamInline.first());
    }

    let maxLen = 0;
    let $best = $tds.eq(0);
    $tds.each((_i, td) => {
      const s = textOf($(td));
      if (s.length > maxLen) {
        maxLen = s.length;
        $best = $(td);
      }
    });
    const riderRaw = getRiderCellCleanText($, $best);
    rider = cleanRiderName(riderRaw, team);

    $tds.each((_i, td) => {
      const s = textOf($(td));
      if (!time && looksLikeTime(s)) time = s;
    });

    if (!rank) {
      const idxInTbody = $tr.index();
      if (idxInTbody >= 0) rank = idxInTbody + 1;
    }
  }

  if (!rank) return null;

  // --- Detección Breakaway (prioriza svg_shield) ---
  const inline = hasBreakawayIconInline($tr, $);

  let inComplementary = false;
  if (riderUrl) {
    inComplementary = complementaryBreakaway.has(riderUrl);
  } else if (complementaryBreakaway.size > 0) {
    // Fallback por nombre si hubiéramos encontrado sección complementaria
    const key = rider.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    for (const url of complementaryBreakaway) {
      if (url.toLowerCase().includes(key.replace(/\s+/g, "-"))) {
        inComplementary = true;
        break;
      }
    }
  }

  const BreakawayIcon = inline || inComplementary;

  if (DEBUG && rank <= 12) {
    console.warn(
      `[row] #${rank} ${rider} — inline:${inline} complementary:${inComplementary} url:${riderUrl}`
    );
  }

  return {
    Stage: stage,
    Rank: rank,
    Rider: rider,
    Team: team,
    Time: time || "",
    Gaps: "",
    PCS_Rider_URL: riderUrl,
    BreakawayIcon,
  };
}
