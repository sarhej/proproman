export type WikiIndex = {
  title: string;
  description: string;
  pages: Array<{
    slug: string;
    title: string;
    file: string;
    description?: string;
    /** ISO-8601 date; included in TechArticle JSON-LD when set */
    datePublished?: string;
    dateModified?: string;
  }>;
};
