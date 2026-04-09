export type WikiIndex = {
  title: string;
  description: string;
  pages: Array<{ slug: string; title: string; file: string }>;
};
