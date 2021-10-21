import { PageContext } from '../renderer/types';

export const onBeforeRender = () => {
  return {
    pageContext: {
      documentProps: {
        title: 'Subtitle App',
      },
    } as PageContext,
  };
};
