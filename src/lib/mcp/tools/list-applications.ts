import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { buildAnalyticalPhrase, getDashboardData } from "../../../data/applications";

export default defineTool({
  name: "list_applications",
  title: "Список заявлений",
  description:
    "Возвращает записи из конкурсных списков с необязательной фильтрацией по вузу и основе (Бюджет/Платное) и сортировкой по позиции.",
  inputSchema: {
    university: z.string().optional().describe("Фильтр по названию вуза, напр. 'СПбГУПТД'."),
    basis: z.enum(["Бюджет", "Платное"]).optional().describe("Фильтр по основе поступления."),
    limit: z.number().int().positive().max(100).optional().describe("Максимум записей в ответе."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ university, basis, limit }) => {
    const data = await getDashboardData();
    let rows = data.applications;
    if (university) rows = rows.filter((a) => a.university === university);
    if (basis) rows = rows.filter((a) => a.basis === basis);
    rows = [...rows].sort((a, b) => a.position - b.position);
    if (limit) rows = rows.slice(0, limit);
    const enriched = rows.map((a) => ({ ...a, note: buildAnalyticalPhrase(a) }));
    return {
      content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      structuredContent: { count: enriched.length, applications: enriched },
    };
  },
});
