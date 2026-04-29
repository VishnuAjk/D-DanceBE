import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../middleware/logger';

export interface OtpAdapter {
  send(phone: string): Promise<{ txnId: string; expiresIn: number }>;
  verify(phone: string, otp: string, txnId: string): Promise<boolean>;
}

class MockOtpAdapter implements OtpAdapter {
  async send(phone: string) {
    logger.info({ phone }, '[MockOTP] OTP sent (use 123456)');
    return { txnId: `mock-txn-${Date.now()}`, expiresIn: 300 };
  }

  async verify(_phone: string, otp: string, _txnId: string) {
    return otp === '123456';
  }
}

class MSG91Adapter implements OtpAdapter {
  async send(phone: string) {
    const response = await axios.post(
      'https://api.msg91.com/api/v5/otp',
      {
        mobile: `91${phone}`,
        authkey: env.MSG91_AUTH_KEY,
        template_id: env.MSG91_TEMPLATE_ID
      },
      { timeout: 8000 }
    );

    if (response.data.type !== 'success') {
      throw new Error('MSG91 send failed');
    }

    return { txnId: response.data.request_id, expiresIn: 300 };
  }

  async verify(phone: string, otp: string, _txnId: string) {
    const response = await axios.post(
      'https://api.msg91.com/api/v5/otp/verify',
      {
        mobile: `91${phone}`,
        otp,
        authkey: env.MSG91_AUTH_KEY
      },
      { timeout: 8000 }
    );

    return response.data.type === 'success';
  }
}

export const otpAdapter: OtpAdapter =
  env.OTP_PROVIDER === 'msg91' ? new MSG91Adapter() : new MockOtpAdapter();
