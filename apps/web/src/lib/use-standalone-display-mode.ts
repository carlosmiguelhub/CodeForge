"use client";

import { useEffect, useState } from "react";

interface StandaloneNavigator extends Navigator {
  readonly standalone?: boolean;
}

export function useStandaloneDisplayMode(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setIsStandalone(
        query.matches || (navigator as StandaloneNavigator).standalone === true,
      );

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isStandalone;
}
