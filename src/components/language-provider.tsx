"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Language = "en" | "es" | "ar";
const labels = {
  en: { shop: "Shop wholesale", apply: "Become a distributor", story: "Our story", login: "Account", cart: "Cart", kicker: "Wholesale, elevated.", hero: "MOVE PRODUCT. BUILD MOMENTUM.", heroCopy: "A sharper wholesale experience for retailers who want fast-moving inventory, flexible fulfillment, and a partner that picks up the phone.", explore: "Explore the catalog", wholesale: "Open a wholesale account" },
  es: { shop: "Comprar al por mayor", apply: "Ser distribuidor", story: "Nuestra historia", login: "Cuenta", cart: "Carrito", kicker: "Mayoreo, elevado.", hero: "MUEVE PRODUCTO. CREA IMPULSO.", heroCopy: "Una experiencia mayorista más ágil para minoristas que buscan inventario de alta rotación, entregas flexibles y un socio presente.", explore: "Explorar el catálogo", wholesale: "Abrir cuenta mayorista" },
  ar: { shop: "تسوق بالجملة", apply: "كن موزعًا", story: "قصتنا", login: "الحساب", cart: "السلة", kicker: "تجارة جملة بمستوى أعلى.", hero: "حرّك المنتجات. اصنع الزخم.", heroCopy: "تجربة جملة أكثر ذكاءً للمتاجر التي تريد مخزونًا سريع الحركة وخيارات استلام وتوصيل مرنة وشريكًا موثوقًا.", explore: "استكشف المنتجات", wholesale: "افتح حساب جملة" },
};

type LanguageContextValue = { language: Language; setLanguage: (value: Language) => void; copy: typeof labels.en };
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, copy: labels[language] }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

