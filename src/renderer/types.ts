import { Component } from 'solid-js';
import type { PageContextBuiltIn } from 'vike/types';
export type PageProps = {};
export type PageContext = PageContextBuiltIn & {
  Page: (pageProps: PageProps) => Component;
  pageProps: PageProps;
  documentProps?: {
    title?: string;
    description?: string;
  };
};
