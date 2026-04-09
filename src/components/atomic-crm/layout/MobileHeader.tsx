import { MobileUserMenu } from "./MobileUserMenu";

const MobileHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-10 bg-secondary h-14 px-4 w-full flex items-center gap-2">
      <div className="flex flex-1 min-w-0 items-center justify-between gap-2">
        {children}
      </div>
      <MobileUserMenu />
    </header>
  );
};

export default MobileHeader;
