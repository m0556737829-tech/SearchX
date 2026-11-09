const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept",
  "access-control-max-age": "86400"
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    ...corsHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Allow HTML files opened locally (file://) to call this Worker.
    if (request.method === "OPTIONS" && url.pathname === "/api/search") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/api/search") {
      const query = (url.searchParams.get("q") || "").trim();
      if (!query) return json({ results: [] }, 400);

      if (!env.SEARXNG_BASE_URL) {
        return json({
          error: "Search provider is not configured yet.",
          results: []
        }, 503);
      }

      try {
        const upstream = new URL("/search", env.SEARXNG_BASE_URL);
        upstream.searchParams.set("q", query);
        upstream.searchParams.set("format", "json");
        upstream.searchParams.set("language", url.searchParams.get("language") || "he");
        upstream.searchParams.set("pageno", url.searchParams.get("pageno") || "1");

        const category = url.searchParams.get("categories");
        if (category && category !== "general") {
          upstream.searchParams.set("categories", category);
        }

        const response = await fetch(upstream.toString(), {
          headers: { "accept": "application/json" }
        });

        if (!response.ok) {
          return json({
            error: "The search provider returned HTTP " + response.status,
            results: []
          }, 502);
        }

        const data = await response.json();
        return json({
          results: Array.isArray(data.results) ? data.results : []
        });
      } catch (error) {
        return json({
          error: "Could not contact the search provider.",
          results: []
        }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
