"use client";

import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  getMessages,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** The server resolves the cookie once and provides the same locale to every island. */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return createElement(LocaleContext.Provider, { value: locale }, children);
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useMessages(): Dictionary {
  return getMessages(useLocale());
}
