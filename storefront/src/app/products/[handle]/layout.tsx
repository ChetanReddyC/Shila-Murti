import type { Metadata } from "next";

interface ProductLayoutProps {
  children: React.ReactNode;
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  
  // Convert handle back to a readable title for SEO
  const title = handle
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    title: `${title} - Shila Murthi`,
    description: `Discover the ${title} stone idol. Handcrafted with precision and care, perfect for your spiritual space.`,
  };
}

export default function ProductLayout({ children }: ProductLayoutProps) {
  return children;
}