// Matches a path against a template such as `invoicing/invoices/:invoiceId/edit` and returns the captured parameters,
// or undefined when the path is another page. Plain segment comparison, no guessing.
export function matchPathTemplate({ template, path }: { template: string; path: string }): Record<string, string> | undefined {
  const templateSegments = template.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);

  if (templateSegments.length !== pathSegments.length) {
    return undefined;
  }

  const params: Record<string, string> = {};

  for (const [index, templateSegment] of templateSegments.entries()) {
    const pathSegment = pathSegments[index]!;

    if (templateSegment.startsWith(':')) {
      params[templateSegment.slice(1)] = decodeURIComponent(pathSegment);
    } else if (templateSegment !== pathSegment) {
      return undefined;
    }
  }

  return params;
}
