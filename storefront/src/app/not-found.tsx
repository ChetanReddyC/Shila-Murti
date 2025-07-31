import Header from '../components/Header';

export default function NotFound() {
  return (
    <div
      className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
      style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        <Header />

        <div className="px-4 md:px-20 lg:px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
            <div className="text-center py-20">
              <div className="mb-8">
                <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
                <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                  Product Not Found
                </h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  The product you're looking for doesn't exist or may have been moved. 
                  Let's get you back to browsing our beautiful stone idols.
                </p>
              </div>

              <div className="space-y-4">
                <a
                  href="/products"
                  className="inline-block bg-black text-white px-8 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                >
                  Browse All Products
                </a>
                <div className="text-center">
                  <a
                    href="/"
                    className="text-gray-600 hover:text-gray-900 transition-colors underline"
                  >
                    Return to Homepage
                  </a>
                </div>
              </div>

              {/* Decorative element */}
              <div className="mt-12 opacity-20">
                <svg
                  className="w-32 h-32 mx-auto text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}