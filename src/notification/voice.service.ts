import { Injectable, Logger } from '@nestjs/common';
import twilio, { Twilio } from 'twilio';

export interface CallResult {
  success: boolean;
  callSid?: string;
  status?: string;
  error?: string;
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private client: Twilio | null = null;

  private ensureClient(): Twilio | null {
    if (this.client) return this.client;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      this.logger.warn('Twilio is not configured; Voice calls will be logged only');
      return (this.client = null);
    }
    this.client = twilio(sid, token);
    return this.client;
  }

  /**
   * Make a phone call using Twilio
   * @param to - Phone number to call (e.g., '+21612345678' for Tunisia)
   * @param from - Twilio phone number to call from
   * @param message - Optional message to play during the call
   * @param statusCallback - Optional URL to receive call status updates
   * @returns Call result with call SID and status
   */
  async makeCall(
    to: string,
    from?: string,
    message?: string,
    statusCallback?: string,
  ): Promise<CallResult> {
    const client = this.ensureClient();
    const twilioFrom = from || process.env.TWILIO_FROM_NUMBER;

    if (!client || !twilioFrom) {
      this.logger.log(`[DEV-VOICE] Would call: ${to} from ${twilioFrom || 'N/A'}`);
      return {
        success: false,
        error: 'Twilio not configured',
      };
    }

    try {
      // Format phone number (ensure it starts with +)
      // For Tunisia, if number starts with 0, replace with +216
      let formattedTo = to.trim();
      if (formattedTo.startsWith('0')) {
        formattedTo = `+216${formattedTo.substring(1)}`;
      } else if (!formattedTo.startsWith('+')) {
        formattedTo = `+${formattedTo}`;
      }

      // Create TwiML for the call
      // If message is provided, play it; otherwise, just connect
      const twimlUrl = message
        ? `${process.env.BACKEND_URL || 'http://localhost:3005'}/voice/play-message?message=${encodeURIComponent(message)}`
        : undefined;

      // Make the call
      const call = await client.calls.create({
        to: formattedTo,
        from: twilioFrom,
        url: twimlUrl || `${process.env.BACKEND_URL || 'http://localhost:3005'}/voice/connect`,
        statusCallback: statusCallback || `${process.env.BACKEND_URL || 'http://localhost:3005'}/voice/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed', 'canceled'],
        statusCallbackMethod: 'POST',
      });

      this.logger.log(`✅ [Voice] Call initiated to ${formattedTo}, Call SID: ${call.sid}`);
      return {
        success: true,
        callSid: call.sid,
        status: call.status,
      };
    } catch (error: any) {
      this.logger.error(`❌ [Voice] Failed to call ${to}: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check call status
   */
  async getCallStatus(callSid: string): Promise<any> {
    const client = this.ensureClient();
    if (!client) {
      return null;
    }

    try {
      const call = await client.calls(callSid).fetch();
      return {
        sid: call.sid,
        status: call.status,
        duration: call.duration,
        direction: call.direction,
        from: call.from,
        to: call.to,
      };
    } catch (error: any) {
      this.logger.error(`❌ [Voice] Failed to get call status for ${callSid}: ${error.message}`);
      return null;
    }
  }
}

