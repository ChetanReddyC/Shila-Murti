/**
 * Debug utility to test API response and understand data structure
 */

export const debugMedusaApiResponse = async () => {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || '';
    const salesChannelId = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || '';
    
    
    // First, test regions
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
      }
    } catch (regionError) {
    }
    
    // Test products without expand
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
      return;
    }
    
    const basicData = await basicResponse.json();
    
    // Test products with expand
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
      return;
    }
    
    const expandedData = await expandedResponse.json();
    
    if (expandedData.products && expandedData.products.length > 0) {
      const firstProduct = expandedData.products[0];
      
      if (firstProduct.variants && firstProduct.variants.length > 0) {
        const firstVariant = firstProduct.variants[0];
      }
    }
    
  } catch (error) {
  }
};

// Call this function to debug
if (typeof window !== 'undefined') {
  (window as any).debugMedusaApi = debugMedusaApiResponse;
}