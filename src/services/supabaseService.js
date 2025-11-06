const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Warning: Supabase credentials not configured. Image upload will not work.');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Upload a vehicle image to Supabase storage
 * @param {Buffer} fileBuffer - The image file buffer
 * @param {string} fileName - The name for the file
 * @param {string} contentType - The MIME type of the file
 * @returns {Promise<string>} - The public URL of the uploaded image
 */
async function uploadVehicleImage(fileBuffer, fileName, contentType) {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please configure SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('vehicle-images')
      .upload(uniqueFileName, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('vehicle-images')
      .getPublicUrl(uniqueFileName);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error uploading vehicle image:', error);
    throw error;
  }
}

/**
 * Upload multiple vehicle images
 * @param {Array<{buffer: Buffer, fileName: string, contentType: string}>} images - Array of image objects
 * @returns {Promise<Array<string>>} - Array of public URLs
 */
async function uploadMultipleVehicleImages(images) {
  if (!images || images.length === 0) {
    return [];
  }

  try {
    const uploadPromises = images.map((image) =>
      uploadVehicleImage(image.buffer, image.fileName, image.contentType)
    );

    const urls = await Promise.all(uploadPromises);
    return urls;
  } catch (error) {
    console.error('Error uploading multiple images:', error);
    throw error;
  }
}

/**
 * Delete a vehicle image from Supabase storage
 * @param {string} imageUrl - The public URL of the image to delete
 * @returns {Promise<boolean>} - Success status
 */
async function deleteVehicleImage(imageUrl) {
  if (!supabase) {
    throw new Error('Supabase client not initialized.');
  }

  try {
    // Extract filename from URL
    const fileName = imageUrl.split('/').pop();

    const { error } = await supabase.storage
      .from('vehicle-images')
      .remove([fileName]);

    if (error) {
      console.error('Supabase delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting vehicle image:', error);
    return false;
  }
}

/**
 * Delete multiple vehicle images
 * @param {Array<string>} imageUrls - Array of image URLs to delete
 * @returns {Promise<boolean>} - Success status
 */
async function deleteMultipleVehicleImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    return true;
  }

  try {
    const deletePromises = imageUrls
      .filter((url) => url) // Filter out null/undefined
      .map((url) => deleteVehicleImage(url));

    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error('Error deleting multiple images:', error);
    return false;
  }
}

module.exports = {
  uploadVehicleImage,
  uploadMultipleVehicleImages,
  deleteVehicleImage,
  deleteMultipleVehicleImages,
};
