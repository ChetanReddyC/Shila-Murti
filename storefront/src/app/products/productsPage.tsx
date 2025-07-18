'use client';

import React from 'react';
import Header from '../../components/Header';
import ProductCardWithShader from '../../components/ProductCardWithShader/ProductCardWithShader';

const products = [
  {
    title: 'Ganesha Idol',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDLuyJZ0xxw_l9UUZPYMMLIG5k9I8fiVs6lcmflwE_12DaUsTg9Zz4nHSGXRPCWuHcGg4SgqHcaFm5a2_OlvZj6CgnY-9pNDVRy1WIJbv-LWBQ6lE_k-teSL6Da366eZQ323rHVwrTqos9EKSJ5ucUGKwNhtdwJUbaznsE3Cu0SrlKj-M76eTRkXlyudU1atflukUlrRQe7bxiAY2yA5vrHir7LVQrFeRh1mDe9IrNGiY-uJvCQPWB2_GI_YqTIEF9MvM-HuI1oleSI',
  },
  {
    title: 'Lakshmi Statue',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAeQzk8rzneSZ7TOpCnxMrIE4B22ojfpsBUr4bcaPZ-i6WBGRa2F26vgUS7ybGR78YvgWjlEwMwJLG-zE-j3MzavNi0qh7nAMkrRnAq_8QYEyteHzuUSenoX0ri2lx6c53fFwxqA3W5F1SKYQVGDVsGYyTZRFaUHD0RCLCL1pQpeg7FYf4_Y3D06GK0MUsi4ZfQjjXiHMc59qAc47S2WqpIo4Zq9YFLZoYeCfei0D15sZt7WWJBR7ntlMzYxIjWgOBEMQyASPxMfWFy',
  },
  {
    title: 'Nandi Bull',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAaxQQ9aq5Z9ZuyzglS8RGOochTnPmKkVt-ld6SiLqNhLlV8CCrK1rcGjRchYf1XKJo7K_mVVO8ODSc63R3Ke74rYZxYuqxWLGCSXU7GZyh-Bi8Eq_eAeV-XWCqXt8KOci3lVv2GvM5IVhqZr8vILrHOVl2ljtGeTKgjjwBbkl8eG6KSTPs2tjWFOAFKqXkPEAGzK3H5mdf2P7D58iKxKaaEGZqhKkCULAs4WzlKgGefSpucQCx4tlFgpJAo_emV6UKBQ7cMi8Q9MBH',
  },
  {
    title: 'Elephant Sculpture',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAd9aVpRHcaPbV_eSzV96JMEI7ywpFgBPhIelaXIP-wL83Dol90y4HV-5l5C9rlo-vNeVtp5asvd709OCdISDTJ6C3_eo6kOBOBpaalXX1Jy0f16d4vLzzvm0DLtEispUiyumtDYUNR4-V7njf7G8VS3Ajid6ihoAJuB4h_lGowxWXgpXAelOagPdc0UM5D9nyFn4e8mhWR9YPQcy37ciov0FF7hsh-C6OQR8pZe9ZTLHkuD1ojrJdZXxZeZMo_P_7RLuzyezUU3k75',
  },
  {
    title: 'Abstract Form 1',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCfs4pZ_nd_gGxMNpAYqRgG3u0I4Adap1RYvbY7a41Qucmj5Xn0xlYwFKgtYut1KAosM153aNnrfro_pHWYmyGoUhcoFXUQAI6jWYZ5Irxyv1haPm6CDBC3wdqg_7e2Byrw-GFEYPx2RXwyMm_KUbvio3GEjqASleHQLlP8lpgOxMWBeXjGzqKrW3mTKqyNJQtHILl72dgh90zfBosCYNjX8fwGiU8NNOSIX9mRpVO5hJRhys7XwwAtypU9zEypeK2Vzt0FkO4roQxs',
  },
  {
    title: 'Abstract Form 2',
    thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAD7nmTHVaG2DcJ66z-YcLbWJrcNu4DUHjUi8wkKfMHgoXpGzBxEdBMjnfyHV92qHAUcPfoX-1zBjwLwZRrXwoKZd0B457TTP16B5aB0yeN4IBVxwk7F6akLpqritS9T2NB4IECPX9W1TLHS1GAp7U4T5Wcg2NWhSED7_lpvmI2NXGkJ6llEmRD_hDGJAffwvH7zm_m4VJBzsgQrS5Fe9i1G0c-boYUntJvHg0Kx-cJ_RQkqpS4-hCmZ5c1I3X_6w3PurN6CHfrOa5o',
  },
];

export default function ProductsPage() {
  return (
    <div 
      className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-x-hidden" 
      style={{ fontFamily: '"Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        {/* Using the Header component */}
        <Header />
        
        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col gap-6 max-w-[960px] flex-1">
            <p className="py-8 text-[#141414] tracking-light text-[32px] font-bold leading-tight">Stone Idols</p>
            <div className="flex flex-col gap-6">
              <div className="flex gap-3 flex-wrap">
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Deities</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Animals</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Abstract</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Marble</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
.                <button className="flex h-8 w-25 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-8 pr-8">
                  <p className="text-[#141414] text-sm font-medium leading-normal">Granite</p>
                  <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                    </svg>
                  </div>
                </button>
              </div>
            </div>
            <div className="@container">
              <div className="relative flex w-full flex-col items-start justify-between gap-3 p-4 @[480px]:flex-row">
                <p className="text-[#141414] text-base font-medium leading-normal w-full shrink-[3]">Price Range</p>
                <div className="flex h-[38px] w-full pt-1.5">
                  <div className="flex h-1 w-full rounded-sm bg-[#e0e0e0] pl-[60%] pr-[15%]">
                    <div className="relative">
                      <div className="absolute -left-3 -top-1.5 flex flex-col items-center gap-1">
                        <div className="size-4 rounded-full bg-[#141414]"></div>
                        <p className="text-[#141414] text-sm font-normal leading-normal">0</p>
                      </div>
                    </div>
                    <div className="h-1 flex-1 rounded-sm bg-[#141414]"></div>
                    <div className="relative">
                      <div className="absolute -left-3 -top-1.5 flex flex-col items-center gap-1">
                        <div className="size-4 rounded-full bg-[#141414]"></div>
                        <p className="text-[#141414] text-sm font-normal leading-normal">1000</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-3 flex-wrap pr-4">
              <button className="flex h-8 w-35 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f2f2f2] pl-4 pr-2">
                <p className="text-[#141414] text-sm font-medium leading-normal">Sort by: Price</p>
                <div className="text-[#141414]" data-icon="CaretDown" data-size="20px" data-weight="regular">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                  </svg>
                </div>
              </button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] gap-x-6 gap-y-8 p-4">
              {products.map((product) => (
                <ProductCardWithShader key={product.title} product={product} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
