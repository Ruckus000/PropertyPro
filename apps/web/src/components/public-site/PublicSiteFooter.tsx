interface PublicSiteFooterProps {
  communityName: string;
}

/**
 * Public site footer — displays community name, "Powered by PropertyPro",
 * and copyright year.
 */
export function PublicSiteFooter({ communityName }: PublicSiteFooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-gray-200 bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
        <span>
          &copy; {currentYear} {communityName}. All rights reserved.
        </span>
        <span>
          Powered by{' '}
          <a
            href="https://propertyprofl.com"
            className="text-blue-600 hover:text-blue-700 font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            PropertyPro
          </a>
        </span>
      </div>
    </footer>
  );
}
