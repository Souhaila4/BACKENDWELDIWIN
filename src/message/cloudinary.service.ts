import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudinaryUrl = this.configService.get<string>('CLOUDINARY_URL');
    if (!cloudinaryUrl) {
      this.isConfigured = false;
      this.logger.warn('CLOUDINARY_URL is not set. Falling back to base64 audio storage.');
      return;
    }

    const parsed = this.parseCloudinaryUrl(cloudinaryUrl);
    if (!parsed) {
      this.isConfigured = false;
      this.logger.error('Invalid CLOUDINARY_URL format. Expected cloudinary://API_KEY:API_SECRET@CLOUD_NAME');
      return;
    }

    cloudinary.config({
      cloud_name: parsed.cloudName,
      api_key: parsed.apiKey,
      api_secret: parsed.apiSecret,
      secure: true,
    });
    this.isConfigured = true;
    this.logger.log(`Cloudinary configured for cloud "${parsed.cloudName}"`);
  }

  enabled(): boolean {
    return this.isConfigured;
  }

  private parseCloudinaryUrl(url: string):
    | { apiKey: string; apiSecret: string; cloudName: string }
    | null {
    const regex = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/;
    const matches = regex.exec(url);
    if (!matches) {
      return null;
    }
    const [, apiKey, apiSecret, cloudName] = matches;
    return { apiKey, apiSecret, cloudName };
  }

  async uploadAudio(
    file: Express.Multer.File,
    options?: { folder?: string; publicId?: string },
  ): Promise<UploadApiResponse> {
    if (!this.isConfigured) {
      throw new Error('Cloudinary is not configured');
    }

    return new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video', // audio files are handled via the video pipeline
          folder: options?.folder ?? 'weldiwin/messages/audio',
          public_id: options?.publicId,
          overwrite: true,
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error('Failed to upload audio to Cloudinary', error as Error);
            return reject(error);
          }
          return resolve(result);
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  /**
   * Delete a file from Cloudinary by public_id
   */
  async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'video'): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('Cloudinary is not configured, skipping file deletion');
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      this.logger.log(`✅ Deleted file from Cloudinary: ${publicId}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete file from Cloudinary: ${error?.message ?? 'Unknown error'}`);
      // Don't throw - deletion of file from storage shouldn't block message deletion
    }
  }
}

