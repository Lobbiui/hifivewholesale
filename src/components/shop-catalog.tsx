"use client";

import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { products } from "@/lib/data";
import { ProductCard } from "./product-card";
import { useLanguage } from "./language-provider";

type FilterKey = "categories" | "brands" | "strengths" | "flavors";
type Filters = Record<FilterKey, string[]>;
const emptyFilters: Filters = { categories: [], brands: [], strengths: [], flavors: [] };
const unique = (values: string[]) => [...new Set(values)].sort();

export function ShopCatalog() {
  const { copy } = useLanguage();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState("featured");
  const [mobileFilters, setMobileFilters] = useState(false);
  const options = {
    categories: unique(products.map((product) => product.category)),
    brands: unique(products.map((product) => product.brand)),
    strengths: unique(products.map((product) => product.strength)),
    flavors: unique(products.map((product) => product.flavor)),
  };

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = products.filter((product) => {
      const searchable = [product.name, product.brand, product.category, product.strength, product.flavor].join(" ").toLowerCase();
      return (!normalized || searchable.includes(normalized))
        && (!filters.categories.length || filters.categories.includes(product.category))
        && (!filters.brands.length || filters.brands.includes(product.brand))
        && (!filters.strengths.length || filters.strengths.includes(product.strength))
        && (!filters.flavors.length || filters.flavors.includes(product.flavor));
    });
    return [...result].sort((a, b) => {
      if (sort === "price-low") return (a.casePrice ?? Number.POSITIVE_INFINITY) - (b.casePrice ?? Number.POSITIVE_INFINITY);
      if (sort === "price-high") return (b.casePrice ?? Number.NEGATIVE_INFINITY) - (a.casePrice ?? Number.NEGATIVE_INFINITY);
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "new") return (b.badge === "New" ? 1 : 0) - (a.badge === "New" ? 1 : 0);
      return (b.badge ? 1 : 0) - (a.badge ? 1 : 0);
    });
  }, [filters, query, sort]);

  const active = Object.entries(filters).flatMap(([key, values]) => values.map((value) => ({ key: key as FilterKey, value })));
  const toggle = (key: FilterKey, value: string) => setFilters((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  const clear = () => { setQuery(""); setFilters(emptyFilters); };

  return <section className="shop-catalog container">
    <div className="catalog-search-row">
      <div className="catalog-search"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.catalog.search} aria-label={copy.catalog.search}/>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X/></button>}</div>
      <button className="mobile-filter-button" onClick={() => setMobileFilters(true)}><SlidersHorizontal/>{copy.catalog.filters} {active.length > 0 && <span>{active.length}</span>}</button>
      <label className="catalog-sort">{copy.catalog.sort}<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">{copy.catalog.featured}</option><option value="new">{copy.catalog.newest}</option><option value="name">{copy.catalog.productName}</option></select><ChevronDown/></label>
    </div>
    <div className="quick-categories" aria-label={copy.catalog.brands}><button className={!filters.brands.length ? "active" : ""} onClick={() => setFilters((current) => ({ ...current, brands: [] }))}>{copy.catalog.all} <span>{products.length}</span></button>{options.brands.map((brand) => <button className={filters.brands.includes(brand) ? "active" : ""} key={brand} onClick={() => setFilters((current) => ({ ...current, brands: [brand] }))}>{brand} <span>{products.filter((product) => product.brand === brand).length}</span></button>)}</div>
    <div className="catalog-body">
      {mobileFilters && <button className="filter-scrim" onClick={() => setMobileFilters(false)} aria-label="Close filters"/>}
      <aside className={mobileFilters ? "filter-panel open" : "filter-panel"}><div className="filter-panel-head"><div><span className="eyebrow">{copy.catalog.refine}</span><h2>{copy.catalog.filters.toUpperCase()}</h2></div><button onClick={() => setMobileFilters(false)} aria-label="Close filters"><X/></button></div>{(["categories", "brands", "strengths", "flavors"] as FilterKey[]).map((key) => <fieldset key={key}><legend>{key === "categories" ? copy.catalog.category : key === "brands" ? copy.catalog.brand : key === "strengths" ? copy.catalog.collection : copy.catalog.flavor}</legend>{options[key].map((option) => <label key={option} className="filter-option"><input type="checkbox" checked={filters[key].includes(option)} onChange={() => toggle(key, option)}/><i>{filters[key].includes(option) && <Check/>}</i><span>{option}</span><small>{products.filter((product) => product[key === "categories" ? "category" : key === "brands" ? "brand" : key === "strengths" ? "strength" : "flavor"] === option).length}</small></label>)}</fieldset>)}<button className="clear-filters" onClick={clear}>{copy.catalog.clear}</button><button className="button primary full apply-filters" onClick={() => setMobileFilters(false)}>{copy.catalog.show} {visible.length} {copy.catalog.products}</button></aside>
      <div className="catalog-results">
        <div className="results-head"><div><strong>{visible.length} {copy.catalog.products}</strong><span>{query ? ` matching “${query}”` : ` ${copy.catalog.ready}`}</span></div>{(query || active.length > 0) && <button onClick={clear}>{copy.catalog.reset}</button>}</div>
        {active.length > 0 && <div className="active-filters">{active.map(({ key, value }) => <button key={`${key}-${value}`} onClick={() => toggle(key, value)}>{value}<X/></button>)}</div>}
        {visible.length ? <div className="product-grid catalog-product-grid">{visible.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <div className="catalog-empty"><Search/><span className="eyebrow">{copy.catalog.noResults}</span><h2>{copy.catalog.wider}</h2><p>{copy.catalog.widerCopy}</p><button className="button dark" onClick={clear}>{copy.catalog.resetCatalog}</button></div>}
      </div>
    </div>
  </section>;
}
