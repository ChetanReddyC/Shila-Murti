'use client';

import React, { useState } from 'react';
import Header from '../../components/Header';
import ProductCardWithShader from '../../components/ProductCardWithShader/ProductCardWithShader';
import CosmicVariationSwitcher from '../../components/CosmicVariationSwitcher';
import styles from './productsPage.module.css';

// Abstract Stone Art images
import Product1BgImage from '../../images/products_images/abstract-stone-art-products/product1-bg-img.jpg';
import Product1Image from '../../images/products_images/abstract-stone-art-products/product1-img.png';
import Product2BgImage from '../../images/products_images/abstract-stone-art-products/product2-bg-img.jpg';
import Product2Image from '../../images/products_images/abstract-stone-art-products/product2-img.png';
import Product3BgImage from '../../images/products_images/abstract-stone-art-products/product3-bg-img.jpg';
import Product3Image from '../../images/products_images/abstract-stone-art-products/product3-img.png';

const products = [
  {
    title: 'Abstract Stone Art 1',
    backgroundImage: Product1BgImage.src,
    foregroundImage: Product1Image.src,
    price: 499.99,
    originalPrice: 599.99,
    rating: 4.5,
    reviewCount: 12,
    material: 'Marble',
    dimensions: '12" × 8" × 4"',
    inStock: true,
  },
  {
    title: 'Abstract Stone Art 2',
    backgroundImage: Product2BgImage.src,
    foregroundImage: Product2Image.src,
    price: 649.99,
    originalPrice: 749.99,
    rating: 4.8,
    reviewCount: 24,
    material: 'Granite',
    dimensions: '14" × 10" × 5"',
    inStock: true,
  },
  {
    title: 'Abstract Stone Art 3',
    backgroundImage: Product3BgImage.src,
    foregroundImage: Product3Image.src,
    price: 799.99,
    originalPrice: 899.99,
    rating: 4.7,
    reviewCount: 18,
    material: 'Marble',
    dimensions: '16" × 12" × 6"',
    inStock: false,
  },
];

export default function ProductsPage() {
  const [cosmicVariation, setCosmicVariation] = useState(1);

  return (
    <div
      className="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-hidden"
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
            <div className={styles.productsGrid}>
              {products.map((product) => (
                <div key={product.title} className={styles.productCardWrapper}>
                  <ProductCardWithShader product={product} cosmicVariation={cosmicVariation} />
                </div>
              ))}
            </div>

            {/* Cosmic Variation Switcher */}
            <CosmicVariationSwitcher
              currentVariation={cosmicVariation}
              onVariationChange={setCosmicVariation}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
