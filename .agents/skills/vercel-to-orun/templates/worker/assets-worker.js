// The Worker for a site with no server code (Vite SPA, Gatsby, Docusaurus,
// any static export): every request goes to the static assets, which apply
// the not_found_handling set in wrangler.template.jsonc. Add routes here only
// for what vercel.json rewrites or headers cannot express as _redirects or
// _headers files.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
