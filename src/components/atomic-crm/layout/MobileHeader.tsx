import { MobileUserMenu } from "./MobileUserMenu";

const MobileHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-40 flex w-full items-center gap-2 bg-secondary px-4"
      style={{
        paddingTop: "var(--crm-mobile-safe-top)",
        minHeight:
          "calc(var(--crm-mobile-header-height) + var(--crm-mobile-safe-top))",
      }}
    >
      <div className="flex flex-1 min-w-0 items-center justify-between gap-2">
        {children}
      </div>
      <MobileUserMenu />
    </header>
  );
};

export default MobileHeader;
