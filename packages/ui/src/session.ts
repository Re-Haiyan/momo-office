export function sessionToken() {
  return (
    (window as any).momoDesktop?.apiToken ||
    document.querySelector<HTMLMetaElement>('meta[name="momo-token"]')
      ?.content ||
    ""
  );
}
export function sessionHeaders(): Record<string, string> {
  return { "X-Momo-Token": sessionToken() };
}
