import {useEffect} from 'react';
import type {ReactNode} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';

/**
 * Legacy /compare bookmarks redirect to the homepage, preserving query + hash
 * (e.g. /compare?t=fabric&f=security#matrix → /?t=fabric&f=security#matrix).
 */
export default function CompareRedirect(): ReactNode {
  const home = useBaseUrl('/');

  useEffect(() => {
    const {search, hash} = window.location;
    const target = `${home}${search}${hash}`;
    if (window.location.pathname.replace(/\/$/, '') === home.replace(/\/$/, '')) {
      return;
    }
    window.location.replace(target);
  }, [home]);

  return (
    <Layout title="Redirecting…" description="This page moved to the Fabric homepage.">
      <main style={{padding: '4rem 1.5rem', textAlign: 'center'}}>
        <p>
          This comparison now lives on the{' '}
          <a href={home}>Fabric homepage</a>. Redirecting…
        </p>
      </main>
    </Layout>
  );
}
