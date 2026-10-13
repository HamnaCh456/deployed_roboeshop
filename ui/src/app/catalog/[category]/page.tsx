import CatalogScreen from "../../../components/catalog/CatalogScreen";

/**
 * `/catalog/[category]` — the catalogue with a category preset. The navbar
 * strip links here; Catalog reads the slug with `useParams` and folds it into
 * the query string it already filters on.
 */
export default function CatalogCategoryPage() {
  return <CatalogScreen />;
}
