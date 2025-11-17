/**
 * Debug script to test textBlocks extraction
 */

import { prisma } from './src/config/database';

async function debugTextBlocks() {
  const documentId = 'cmi1hw5ok0022p7tiki7rwpgp';

  console.log('\n=== Fetching document ===');
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    console.log('❌ Document not found');
    return;
  }

  console.log('\n✅ Document found:');
  console.log('  - ID:', document.id);
  console.log('  - Title:', document.title);
  console.log('  - Metadata type:', typeof document.metadata);
  console.log('  - Metadata:', document.metadata);

  // Test the extraction logic from the controller
  let textBlocks: any[] | undefined;
  if (document.metadata && typeof document.metadata === 'object') {
    console.log('\n✅ Metadata is an object');
    const metadata = document.metadata as any;

    console.log('  - metadata.textBlocks type:', typeof metadata.textBlocks);
    console.log('  - is Array?', Array.isArray(metadata.textBlocks));

    if (Array.isArray(metadata.textBlocks)) {
      textBlocks = metadata.textBlocks;
      console.log('\n✅ Found textBlocks!');
      console.log('  - Count:', textBlocks.length);
      console.log('  - First block:', JSON.stringify(textBlocks[0], null, 2));
      console.log('  - Last block:', JSON.stringify(textBlocks[textBlocks.length - 1], null, 2));
    } else {
      console.log('\n❌ metadata.textBlocks is not an array');
    }
  } else {
    console.log('\n❌ Metadata is not an object');
    console.log('  - Type:', typeof document.metadata);
  }

  console.log('\n=== Summary ===');
  console.log('textBlocks extracted:', textBlocks ? '✅ YES' : '❌ NO');
  console.log('Count:', textBlocks?.length || 0);

  await prisma.$disconnect();
}

debugTextBlocks().catch(console.error);
