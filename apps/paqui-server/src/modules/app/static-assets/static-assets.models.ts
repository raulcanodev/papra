export function isApiRoute({ path }: { path: string }) {
  return path.startsWith('/api/') || path === '/api';
};

/**
 * Build assets are fingerprinted files under /assets. A missing one is a real 404, never the SPA shell:
 * after a deploy, tabs still holding the old build ask for chunks that no longer exist and must not receive index.html as JavaScript.
 */
export function isAssetRoute({ path }: { path: string }) {
  return path.startsWith('/assets/');
}
