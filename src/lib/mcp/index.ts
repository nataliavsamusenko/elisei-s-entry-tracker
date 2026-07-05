import { defineMcp } from "@lovable.dev/mcp-js";
import getDashboardSummary from "./tools/get-dashboard-summary";
import listApplications from "./tools/list-applications";
import getTopPositions from "./tools/get-top-positions";

export default defineMcp({
  name: "eliseus-admissions-mcp",
  title: "Трекер поступления Елисея — MCP",
  version: "0.1.0",
  instructions:
    "Инструменты для чтения дашборда поступления абитуриента Елисея (№1431604, кампания 2026). " +
    "Используйте get_dashboard_summary для общей картины, list_applications для детальных записей с фильтрами по вузу/основе, " +
    "get_top_positions для ближайших к началу списка позиций. Данные — снимок конкурсных списков; общая позиция ≠ прогноз поступления.",
  tools: [getDashboardSummary, listApplications, getTopPositions],
});
