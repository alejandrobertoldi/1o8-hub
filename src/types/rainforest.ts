/**
 * Rainforest API product response type.
 * Docs: https://www.rainforestapi.com/docs/product-data-api/results/product
 */

export interface RainforestPrice {
  symbol: string;
  value: number;
  currency: string;
  raw: string;
}

export interface RainforestFulfillment {
  type: string;
  is_fulfilled_by_amazon: boolean;
  is_sold_by_amazon: boolean;
  is_fulfilled_by_third_party: boolean;
  is_sold_by_third_party: boolean;
  third_party_seller?: { name: string };
  standard_delivery?: { date: string; name: string };
  fastest_delivery?: { date: string; name: string };
}

export interface RainforestBuyboxWinner {
  price: RainforestPrice;
  unit_price?: RainforestPrice;
  availability: { type: string; raw: string; dispatch_days?: number };
  fulfillment: RainforestFulfillment;
  is_prime: boolean;
  condition?: { is_new: boolean };
  subscribe_and_save?: {
    base_discount_percentage: number;
    base_price: RainforestPrice;
  };
  return_policy?: { duration_days: number; type: string };
  maximum_order_quantity?: { value: number; hard_maximum: boolean };
}

export interface RainforestVariant {
  asin: string;
  title: string;
  is_current_product: boolean;
  link: string;
  main_image?: string;
}

export interface RainforestAPlusContent {
  has_a_plus_content: boolean;
  has_brand_story: boolean;
  all_images?: { link: string; name: string }[];
}

export interface RainforestProduct {
  title?: string;
  title_excluding_variant_name?: string;
  asin: string;
  parent_asin?: string;
  brand?: string;
  link?: string;
  main_image?: { link: string };
  images?: { link: string; variant?: string }[];
  images_count?: number;
  videos_count?: number;
  feature_bullets?: string[];
  feature_bullets_count?: number;
  rating?: number;
  ratings_total?: number;
  rating_breakdown?: {
    five_star: { percentage: number; count: number };
    four_star: { percentage: number; count: number };
    three_star: { percentage: number; count: number };
    two_star: { percentage: number; count: number };
    one_star: { percentage: number; count: number };
  };
  dimensions?: string;
  weight?: string;
  first_available?: { raw: string; utc: string };
  buybox_winner?: RainforestBuyboxWinner;
  specifications?: { name: string; value: string }[];
  bestsellers_rank?: { rank: number; category: string; link: string }[];
  bestsellers_rank_flat?: string;
  categories?: { name: string; link: string; category_id: string }[];
  categories_flat?: string;
  variants?: RainforestVariant[];
  a_plus_content?: RainforestAPlusContent;
  recent_sales?: string;
  ingredients?: string[];
  manufacturer?: string;
  amazons_choice?: { link: string; badge_text: string };
  top_reviews?: {
    id: string;
    title: string;
    body: string;
    rating: number;
    date: { raw: string };
    profile: { name: string };
    verified_purchase: boolean;
    helpful_votes?: number;
  }[];
}
