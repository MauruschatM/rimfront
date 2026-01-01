import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
    baseUrl: "/docs",
    source: docs.toFumadocsSource(),
    plugins: [lucideIconsPlugin()],
});
export function getPageImage(page) {
    const segments = [...page.slugs, "image.png"];
    return {
        segments,
        url: `/og/docs/${segments.join("/")}`,
    };
}
export async function getLLMText(page) {
    const processed = await page.data.getText("processed");
    return `# ${page.data.title}

${processed}`;
}
