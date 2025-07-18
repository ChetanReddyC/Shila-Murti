import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

export default async function seedStoneIdolData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);
  const regionModuleService = container.resolve(Modules.REGION);

  // Focus on India as primary market with some international countries
  const requestedCountries = ["in", "us", "gb", "ca", "au"];

  // Check existing regions to avoid conflicts
  const existingRegions = await regionModuleService.listRegions({}, {
    select: ["id", "name", "countries.iso_2", "countries.name"],
    relations: ["countries"]
  });
  
  const takenCountries = new Set<string>();
  existingRegions?.forEach((r: any) => {
    r.countries?.forEach((c: any) => takenCountries.add(c.iso_2));
  });
  
  const countries = requestedCountries.filter((c) => !takenCountries.has(c));

  logger.info("Seeding stone idol store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Stone Idol Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    // Create the default sales channel for stone idols
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Stone Idol Sales Channel",
            description: "Main sales channel for stone idol products",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          {
            currency_code: "inr",
            is_default: true,
          },
          {
            currency_code: "usd",
          },
        ],
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });

  // Find or create a region for our markets
  let region;
  if (countries.length > 0) {
    logger.info("Seeding region data...");
    const { result: regionResult } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "India & International",
            currency_code: "inr",
            countries,
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = regionResult[0];

    logger.info("Seeding tax regions...");
    await createTaxRegionsWorkflow(container).run({
      input: countries.map((country_code) => ({
        country_code,
        provider_id: "tp_system"
      })),
    });
  } else {
    logger.info("All requested countries already belong to a region – using existing region.");
    // Use the first available region that contains India
    region = existingRegions.find((r: any) => 
      r.countries?.some((c: any) => c.iso_2 === "in")
    ) || existingRegions[0];
  }

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Main Workshop & Warehouse",
          address: {
            city: "Jaipur",
            country_code: "IN",
            address_1: "Artisan Quarter",
            postal_code: "302001",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  // Check if stock location to fulfillment provider link already exists
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: "manual_manual",
      },
    });
  } catch (error: any) {
    if (error.message?.includes("multiple links")) {
      logger.info("Stock location to fulfillment provider link already exists");
    } else {
      throw error;
    }
  }

  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default"
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
    await createShippingProfilesWorkflow(container).run({
      input: {
        data: [
          {
            name: "Stone Idol Shipping Profile",
            type: "default",
          },
        ],
      },
    });
    shippingProfile = shippingProfileResult[0];
  }

  // Get all countries for the region (either newly created or existing)
  const allRegionCountries = region.countries || [];
  const fulfillmentCountries = allRegionCountries.length > 0 
    ? allRegionCountries.map((c: any) => c.iso_2)
    : requestedCountries; // fallback to requested countries

  // Check if fulfillment set already exists
  const existingFulfillmentSets = await fulfillmentModuleService.listFulfillmentSets({
    name: "Stone Idol Delivery Network"
  });

  let fulfillmentSet;
  if (existingFulfillmentSets.length > 0) {
    logger.info("Using existing fulfillment set: Stone Idol Delivery Network");
    fulfillmentSet = existingFulfillmentSets[0];
  } else {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "Stone Idol Delivery Network",
      type: "shipping",
      service_zones: [
        {
          name: "India & International",
          geo_zones: fulfillmentCountries.map(country_code => ({
            country_code,
            type: "country" as const,
          })),
        },
      ],
    });
  }

  // Check if stock location to fulfillment set link already exists
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: fulfillmentSet.id,
      },
    });
  } catch (error: any) {
    if (error.message?.includes("multiple links")) {
      logger.info("Stock location to fulfillment set link already exists");
    } else {
      throw error;
    }
  }

  // Get the service zone ID - handle both new and existing fulfillment sets
  const serviceZoneId = fulfillmentSet.service_zones?.[0]?.id;
  if (!serviceZoneId) {
    logger.info("No service zones found in fulfillment set, skipping shipping options creation");
    return;
  }

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Delivery",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Delivered in 7-10 business days with proper packaging",
          code: "standard",
        },
        prices: [
          {
            currency_code: "inr",
            amount: 500, // ₹500 for stone idols
          },
          {
            currency_code: "usd",
            amount: 15,
          },
          {
            region_id: region.id,
            amount: 500,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      {
        name: "Express Delivery",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Delivered in 3-5 business days with premium packaging",
          code: "express",
        },
        prices: [
          {
            currency_code: "inr",
            amount: 1000, // ₹1000 for express delivery
          },
          {
            currency_code: "usd",
            amount: 25,
          },
          {
            region_id: region.id,
            amount: 1000,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });

  logger.info("Seeding publishable API key data...");
  const { result: publishableApiKeyResult } = await createApiKeysWorkflow(
    container
  ).run({
    input: {
      api_keys: [
        {
          title: "Stone Idol Storefront",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  const publishableApiKey = publishableApiKeyResult[0];

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });

  logger.info("Seeding stone idol product categories...");
  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Hindu Deities",
          description: "Traditional Hindu deity idols for worship and decoration",
          is_active: true,
        },
        {
          name: "Buddha Statues",
          description: "Peaceful Buddha statues for meditation and home decor",
          is_active: true,
        },
        {
          name: "Ganesha Idols",
          description: "Lord Ganesha idols for good fortune and new beginnings",
          is_active: true,
        },
        {
          name: "Temple Art",
          description: "Decorative temple-style sculptures and architectural pieces",
          is_active: true,
        },
        {
          name: "Garden Statues",
          description: "Weather-resistant stone sculptures for outdoor spaces",
          is_active: true,
        },
      ],
    },
  });

  logger.info("Seeding stone idol products...");
  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Handcrafted Ganesha Idol - Small",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Ganesha Idols")!.id,
          ],
          description: "Beautifully handcrafted small Ganesha idol made from premium quality sandstone. Perfect for home temples and office spaces. Features intricate detailing and traditional design elements.",
          handle: "ganesha-idol-small",
          weight: 500, // 500 grams
          length: 15, // 15 cm
          width: 10,  // 10 cm  
          height: 20, // 20 cm
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://example.com/images/ganesha-small-front.jpg",
            },
            {
              url: "https://example.com/images/ganesha-small-side.jpg",
            },
          ],
          options: [
            {
              title: "Material",
              values: ["Sandstone", "Marble"],
            },
            {
              title: "Finish",
              values: ["Natural", "Polished"],
            },
          ],
          variants: [
            {
              title: "Sandstone - Natural",
              sku: "GANESHA-SM-SAND-NAT",
              options: {
                Material: "Sandstone",
                Finish: "Natural",
              },
              prices: [
                {
                  amount: 1500, // ₹1,500
                  currency_code: "inr",
                },
                {
                  amount: 25,
                  currency_code: "usd",
                },
              ],
            },
            {
              title: "Sandstone - Polished",
              sku: "GANESHA-SM-SAND-POL",
              options: {
                Material: "Sandstone",
                Finish: "Polished",
              },
              prices: [
                {
                  amount: 2000, // ₹2,000
                  currency_code: "inr",
                },
                {
                  amount: 30,
                  currency_code: "usd",
                },
              ],
            },
            {
              title: "Marble - Natural",
              sku: "GANESHA-SM-MAR-NAT",
              options: {
                Material: "Marble",
                Finish: "Natural",
              },
              prices: [
                {
                  amount: 3500, // ₹3,500
                  currency_code: "inr",
                },
                {
                  amount: 50,
                  currency_code: "usd",
                },
              ],
            },
            {
              title: "Marble - Polished",
              sku: "GANESHA-SM-MAR-POL",
              options: {
                Material: "Marble",
                Finish: "Polished",
              },
              prices: [
                {
                  amount: 4500, // ₹4,500
                  currency_code: "inr",
                },
                {
                  amount: 65,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Meditation Buddha Statue",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Buddha Statues")!.id,
          ],
          description: "Serene meditation Buddha statue carved from high-quality stone. Brings peace and tranquility to any space. Ideal for meditation rooms, gardens, and home decor.",
          handle: "meditation-buddha-statue",
          weight: 2000, // 2 kg
          length: 25,
          width: 20,
          height: 30,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://example.com/images/buddha-meditation-front.jpg",
            },
            {
              url: "https://example.com/images/buddha-meditation-profile.jpg",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["Medium", "Large"],
            },
            {
              title: "Stone Type",
              values: ["Sandstone", "Granite"],
            },
          ],
          variants: [
            {
              title: "Medium - Sandstone",
              sku: "BUDDHA-MED-SAND",
              options: {
                Size: "Medium",
                "Stone Type": "Sandstone",
              },
              prices: [
                {
                  amount: 5500, // ₹5,500
                  currency_code: "inr",
                },
                {
                  amount: 75,
                  currency_code: "usd",
                },
              ],
            },
            {
              title: "Large - Sandstone",
              sku: "BUDDHA-LG-SAND",
              options: {
                Size: "Large",
                "Stone Type": "Sandstone",
              },
              prices: [
                {
                  amount: 8500, // ₹8,500
                  currency_code: "inr",
                },
                {
                  amount: 115,
                  currency_code: "usd",
                },
              ],
            },
            {
              title: "Medium - Granite",
              sku: "BUDDHA-MED-GRAN",
              options: {
                Size: "Medium",
                "Stone Type": "Granite",
              },
              prices: [
                {
                  amount: 7500, // ₹7,500
                  currency_code: "inr",
                },
                {
                  amount: 100,
                  currency_code: "usd",
                },
              ],
            },
            {
              title: "Large - Granite",
              sku: "BUDDHA-LG-GRAN",
              options: {
                Size: "Large",
                "Stone Type": "Granite",
              },
              prices: [
                {
                  amount: 12000, // ₹12,000
                  currency_code: "inr",
                },
                {
                  amount: 160,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Krishna with Flute Idol",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Hindu Deities")!.id,
          ],
          description: "Elegant Krishna idol playing the flute, masterfully carved with attention to detail. A beautiful addition to any home temple or spiritual space.",
          handle: "krishna-flute-idol",
          weight: 1200, // 1.2 kg
          length: 20,
          width: 15,
          height: 35,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://example.com/images/krishna-flute-front.jpg",
            },
            {
              url: "https://example.com/images/krishna-flute-back.jpg",
            },
          ],
          options: [
            {
              title: "Material",
              values: ["White Marble", "Black Stone"],
            },
          ],
          variants: [
            {
              title: "White Marble",
              sku: "KRISHNA-FLUTE-WM",
              options: {
                Material: "White Marble",
              },
              prices: [
                {
                  amount: 6500, // ₹6,500
                  currency_code: "inr",
                },
                {
                  amount: 90,
                  currency_code: "usd",
                },
              ],
            },
            {
              title: "Black Stone",
              sku: "KRISHNA-FLUTE-BS",
              options: {
                Material: "Black Stone",
              },
              prices: [
                {
                  amount: 5000, // ₹5,000
                  currency_code: "inr",
                },
                {
                  amount: 70,
                  currency_code: "usd",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
      ],
    },
  });

  // Create inventory for all variants
  logger.info("Creating inventory levels...");
  const inventoryItems = [
    // Ganesha variants
    { sku: "GANESHA-SM-SAND-NAT", quantity: 10 },
    { sku: "GANESHA-SM-SAND-POL", quantity: 8 },
    { sku: "GANESHA-SM-MAR-NAT", quantity: 5 },
    { sku: "GANESHA-SM-MAR-POL", quantity: 3 },
    // Buddha variants
    { sku: "BUDDHA-MED-SAND", quantity: 6 },
    { sku: "BUDDHA-LG-SAND", quantity: 4 },
    { sku: "BUDDHA-MED-GRAN", quantity: 4 },
    { sku: "BUDDHA-LG-GRAN", quantity: 2 },
    // Krishna variants
    { sku: "KRISHNA-FLUTE-WM", quantity: 5 },
    { sku: "KRISHNA-FLUTE-BS", quantity: 7 },
  ];

  const inventoryLevels: CreateInventoryLevelInput[] = inventoryItems.map((item) => ({
    location_id: stockLocation.id,
    stocked_quantity: item.quantity,
    reserved_quantity: 0,
  }));

  logger.info("Finished seeding stone idol store data!");
}