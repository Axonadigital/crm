import * as React from "react";
import { Notification } from "@/components/admin/notification";
import { useConfigurationContext } from "@/components/atomic-crm/root/ConfigurationContext";

export const Layout = ({ children }: React.PropsWithChildren) => {
  const { darkModeLogo, title } = useConfigurationContext();

  return (
    <div className="min-h-screen flex">
      <div className="container relative grid flex-col items-center justify-center sm:max-w-none lg:grid-cols-2 lg:px-0">
        <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
          <div className="absolute inset-0 bg-zinc-900" />
          <div className="relative z-20 flex items-center text-lg font-medium">
            <img className="h-8 mr-3" src={darkModeLogo} alt={title} />
            <div>
              <div>{title}</div>
              <div className="text-sm font-normal text-zinc-300">
                Secure workspace for Axona Digital
              </div>
            </div>
          </div>
        </div>
        <div className="lg:p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            <div className="flex flex-col items-center gap-3 text-center lg:hidden">
              <img className="h-12 w-auto" src={darkModeLogo} alt={title} />
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Axona Digital
                </p>
                <h1 className="text-xl font-semibold">{title}</h1>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
      <Notification />
    </div>
  );
};
