import React, { useState, useEffect } from "react";
import { RuntimeProvider } from "../modules/runtime/RuntimeContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AuthProvider } from "../hooks/useAuth";
import { IdentityProvider } from "../modules/identity/IdentityContext";
import { BusinessProvider } from "../contexts/BusinessContext";
import { FilterProvider } from "../contexts/FilterContext";
import { AnalyticsProvider } from "../domains/analytics/context/AnalyticsContext";
import { ExecutiveFilterProvider } from "../domains/analytics/context/ExecutiveFilterContext";
import { translations, Language, I18nContext } from "../i18n";
import { InactivityTimer } from "./InactivityTimer";
import i18next from "i18next";
import { CacheInvalidationService } from "../services/performance/CacheInvalidationService";
import { useIdentityVerification } from "../hooks/useIdentityVerification";

interface AppProvidersProps {
  children: React.ReactNode;
}

const IdentityLifecycleListener: React.FC = () => {
  useIdentityVerification();
  return null;
};

export default function AppProviders({ children }: AppProvidersProps) {
  const [language, setLanguageState] = useState<Language>((i18next.language as Language) || "fr");

  const setLanguage = (lang: Language) => {
    i18next.changeLanguage(lang);
    setLanguageState(lang);
  };

  useEffect(() => {
    if (i18next.language && i18next.language !== language) {
      setLanguageState(i18next.language as Language);
    }
  }, [language]);

  useEffect(() => {
    CacheInvalidationService.initialize();
  }, []);

  const t = translations[language];

  return (
    <RuntimeProvider>
      <ThemeProvider>
        <I18nContext.Provider value={{ language, setLanguage, t }}>
          <FilterProvider>
            <IdentityProvider>
              <AuthProvider>
                <BusinessProvider>
                  <ExecutiveFilterProvider>
                    <AnalyticsProvider>
                      <IdentityLifecycleListener />
                      <InactivityTimer />
                      {children}
                    </AnalyticsProvider>
                  </ExecutiveFilterProvider>
                </BusinessProvider>
              </AuthProvider>
            </IdentityProvider>
          </FilterProvider>
        </I18nContext.Provider>
      </ThemeProvider>
    </RuntimeProvider>
  );
}
