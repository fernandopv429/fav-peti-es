// Usado pelas telas de acesso (Entrar, Primeiro acesso). A validação do
// redirecionamento fica num lugar só: é sensível a segurança.
//
// Resolve ?returnTo= para um caminho seguro da mesma origem, senão "/".
// Além da mesma origem, exige uma única barra inicial (sem "//" e sem "\"),
// para evitar redirecionamento aberto.
export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    for (const p of ["access_token", "clear_access_token", "app_id", "app_base_url", "functions_version", "from_url"]) {
      url.searchParams.delete(p);
    }
    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    if (/^\/(entrar|primeiro-acesso|forgot-password|reset-password)(\/|$)/.test(url.pathname)) return "/";
    return path;
  } catch {
    return "/";
  }
}
