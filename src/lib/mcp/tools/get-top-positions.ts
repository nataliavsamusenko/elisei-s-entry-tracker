import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getDashboardData } from "../../../data/applications";

export default defineTool({
  name: "get_top_positions",
  title: "Лучшие текущие позиции",
  description:
    "Возвращает N наилучших (самых близких к началу) текущих позиций Елисея по всем полученным конкурсным спискам.",
  inputSchema: {
    count: z.number().int().positive().max(20).optional().describe("Сколько позиций вернуть (по умолчанию 6)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ count }) => {
    const data = await getDashboardData();
    const top = [...data.applications].sort((a, b) => a.position - b.position).slice(0, count ?? 6);
    return {
      content: [{ type: "text", text: JSON.stringify(top, null, 2) }],
      structuredContent: { top },
    };
  },
});
