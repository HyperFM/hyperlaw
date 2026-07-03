/**
 * HyperLaw Credit Pack seed script
 *
 * Creates the three credit-pack products in Stripe.
 * Idempotent — checks for existing products before creating.
 *
 * Run with: pnpm --filter @workspace/scripts run seed-products
 */
import { getUncachableStripeClient } from './stripeClient.js';

const PACKS = [
  {
    name: 'HyperLaw — 1 Document Credit',
    description: 'Unlock 1 premium legal document (formal complaint, motion, or structured timeline).',
    credits: 1,
    amount: 499,   // $4.99
  },
  {
    name: 'HyperLaw — 5 Document Credits',
    description: 'Unlock 5 premium legal documents. Save 20% vs single-credit price.',
    credits: 5,
    amount: 1999,  // $19.99
  },
  {
    name: 'HyperLaw — 15 Document Credits',
    description: 'Unlock 15 premium legal documents. Best value — save 33%.',
    credits: 15,
    amount: 4999,  // $49.99
  },
];

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  for (const pack of PACKS) {
    // Check if already exists
    const existing = await stripe.products.search({
      query: `name:'${pack.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`✓ Already exists: ${pack.name} (${existing.data[0].id})`);
      continue;
    }

    // Create product with credits metadata
    const product = await stripe.products.create({
      name: pack.name,
      description: pack.description,
      metadata: {
        credits: String(pack.credits),
        type: 'credit_pack',
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.amount,
      currency: 'usd',
    });

    console.log(`✓ Created: ${pack.name}`);
    console.log(`  Product ID: ${product.id}`);
    console.log(`  Price ID:   ${price.id}`);
    console.log(`  Amount:     $${(pack.amount / 100).toFixed(2)}`);
    console.log(`  Credits:    ${pack.credits}`);
    console.log('');
  }

  console.log('Done! Webhooks will sync data to your database automatically.');
}

seedProducts().catch((err) => {
  console.error('Error seeding products:', err.message);
  process.exit(1);
});
