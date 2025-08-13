/**
 * Debug utility to test API response and understand data structure
 */

export const debugMedusaApiResponse = async () => {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || '';
    const salesChannelId = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || '';
    
    console.log('🔍 Testing Medusa API connection...');
    console.log('Base URL:', baseUrl);
    console.log('Publishable Key:', publishableKey ? 'Present' : 'Missing');
    console.log('Default Sales Channel:', salesChannelId ? salesChannelId : '(none)');
    
    // First, test regions
    console.log('🌍 Testing regions endpoint...');
    try {
      const regionsResponse = await fetch(`${baseUrl}/store/regions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-publishable-api-key': publishableKey,
        },
      });
      
      if (regionsResponse.ok) {
        const regionsData = await regionsResponse.json();
        console.log('✅ Regions Response:', {
          regionsCount: regionsData.regions?.length || 0,
          regions: regionsData.regions?.map((r: any) => ({
            id: r.id,
            name: r.name,
            currency_code: r.currency_code
          }))
        });
      }
    } catch (regionError) {
      console.error('❌ Regions API failed:', regionError);
    }
    
    // Test products without expand
    console.log('📦 Testing products endpoint (basic)...');
    const basicUrl = `${baseUrl}/store/products${salesChannelId ? `?sales_channel_id=${encodeURIComponent(salesChannelId)}` : ''}`;
    const basicResponse = await fetch(basicUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-publishable-api-key': publishableKey,
      },
    });
    
    if (!basicResponse.ok) {
      const errorText = await basicResponse.text();
      console.error('❌ Basic API Error Response:', errorText);
      return;
    }
    
    const basicData = await basicResponse.json();
    console.log('📦 Basic Products Response:', {
      hasProducts: !!basicData.products,
      productsCount: basicData.products?.length || 0,
      firstProductHasVariants: !!basicData.products?.[0]?.variants,
      firstProductVariantsCount: basicData.products?.[0]?.variants?.length || 0
    });
    
    // Test products with expand
    console.log('📦 Testing products endpoint (with expand)...');
    const expandedUrl = `${baseUrl}/store/products?expand=variants,variants.prices,images,options,variants.options${salesChannelId ? `&sales_channel_id=${encodeURIComponent(salesChannelId)}` : ''}`;
    const expandedResponse = await fetch(expandedUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-publishable-api-key': publishableKey,
      },
    });
    
    if (!expandedResponse.ok) {
      const errorText = await expandedResponse.text();
      console.error('❌ Expanded API Error Response:', errorText);
      return;
    }
    
    const expandedData = await expandedResponse.json();
    console.log('📦 Expanded Products Response:', {
      hasProducts: !!expandedData.products,
      productsCount: expandedData.products?.length || 0,
    });
    
    if (expandedData.products && expandedData.products.length > 0) {
      const firstProduct = expandedData.products[0];
      console.log('🏷️ First Product (Expanded):', {
        id: firstProduct.id,
        title: firstProduct.title,
        hasVariants: !!firstProduct.variants,
        variantsCount: firstProduct.variants?.length || 0,
        hasImages: !!firstProduct.images,
        imagesCount: firstProduct.images?.length || 0,
        fullProduct: firstProduct // Log the entire product
      });
      
      if (firstProduct.variants && firstProduct.variants.length > 0) {
        const firstVariant = firstProduct.variants[0];
        console.log('💰 First Variant (Expanded):', {
          variantId: firstVariant.id,
          variantTitle: firstVariant.title,
          hasPrices: !!firstVariant.prices,
          pricesCount: firstVariant.prices?.length || 0,
          prices: firstVariant.prices,
          fullVariant: firstVariant // Log the entire variant
        });
      }
    }
    
  } catch (error) {
    console.error('💥 Debug API call failed:', error);
  }
};

// Call this function to debug
if (typeof window !== 'undefined') {
  (window as any).debugMedusaApi = debugMedusaApiResponse;
}