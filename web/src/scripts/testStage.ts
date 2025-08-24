import { buildVuelta2024StageUrl, fetchStageHTML, parseStageResults } from "@/lib/pcs";

async function main() {
  const stage = 8; // cambia aquí para probar otras etapas
  const url = buildVuelta2024StageUrl(stage);
  console.log("Fetching:", url);

  const html = await fetchStageHTML(url);
  const rows = parseStageResults(html, stage);

  console.log("Top 10 resultados (normalizados):");
  console.log(
    rows.slice(0, 10).map(r => ({
      Stage: r.Stage,
      Rank: r.Rank,
      Rider: r.Rider,
      Team: r.Team,
      Time: r.Time,
      PCS_Rider_URL: r.PCS_Rider_URL,
      BreakawayIcon: r.BreakawayIcon,
    }))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
