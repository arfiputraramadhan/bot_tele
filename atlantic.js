require('dotenv').config();
const axios = require('axios');
const QRCode = require('qrcode');

class AtlanticService {
    constructor() {
        this.apiKey = process.env.ATLANTIC_API_KEY;
        this.baseURL = process.env.ATLANTIC_API_URL;
        this.timeout = parseInt(process.env.ATLANTIC_API_TIMEOUT) || 30000;
        this.debug = process.env.ATLANTIC_DEBUG_MODE === 'true';
        
        if (!this.apiKey) {
            console.error('❌ ATLANTIC_API_KEY tidak ditemukan di .env!');
        }
    }

    async createQRISDeposit(params) {
        try {
            console.log('📤 Creating Atlantic QRIS deposit with params:', { ...params, nominal: params.nominal });
            
            const endpoint = '/deposit/create';
            
            const requiredFields = ['reff_id', 'nominal'];
            for (const field of requiredFields) {
                if (!params[field]) {
                    throw new Error(`Field ${field} diperlukan`);
                }
            }
            
            if (params.nominal < 1) {
                throw new Error('Nominal minimal 1');
            }
            
            const requestData = {
                api_key: this.apiKey,
                reff_id: params.reff_id,
                nominal: params.nominal,
                type: 'ewallet',
                metode: 'qris'
            };
            
            if (this.debug) {
                console.log('📤 Atlantic Request:', { 
                    endpoint, 
                    url: `${this.baseURL}${endpoint}`,
                    data: { ...requestData, api_key: '***HIDDEN***' } 
                });
            }
            
            console.log('🔄 Sending request to Atlantic API...');
            const response = await axios.post(`${this.baseURL}${endpoint}`, 
                new URLSearchParams(requestData).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: this.timeout
                }
            );
            
            console.log('📥 Atlantic Response received');
            
            if (this.debug) {
                console.log('📥 Atlantic Response:', JSON.stringify(response.data, null, 2));
            }
            
            if (!response.data.status) {
                throw new Error(response.data.message || 'Gagal membuat deposit');
            }
            
            console.log('✅ Atlantic deposit created successfully:', response.data.data.id);
            
            // Jika ada QR string, generate QR code image
            if (response.data.data?.qr_string) {
                try {
                    console.log('🔄 Generating QR code image...');
                    const qrBuffer = await this.generateQRCode(response.data.data.qr_string);
                    response.data.data.qr_image_buffer = qrBuffer;
                    response.data.data.has_qr_image = true;
                    console.log('✅ QR code image generated');
                } catch (qrError) {
                    console.warn('⚠️ Gagal generate QR code image:', qrError.message);
                    response.data.data.has_qr_image = false;
                }
            }
            
            return {
                success: true,
                data: response.data.data,
                message: 'Deposit QRIS berhasil dibuat'
            };
            
        } catch (error) {
            console.error('❌ Atlantic API Error (createQRISDeposit):', error.message);
            
            if (error.response) {
                console.error('❌ Atlantic API Response Error:', error.response.status, error.response.data);
                const errorData = error.response.data;
                return {
                    success: false,
                    message: errorData.message || `Error ${error.response.status}: ${error.response.statusText}`,
                    errorCode: error.response.status,
                    data: errorData
                };
            } else if (error.request) {
                console.error('❌ Atlantic API No Response');
                return {
                    success: false,
                    message: 'Tidak ada respon dari server Atlantic. Cek koneksi internet Anda.'
                };
            } else if (error.code === 'ECONNABORTED') {
                console.error('❌ Atlantic API Timeout');
                return {
                    success: false,
                    message: 'Timeout: Koneksi ke server Atlantic terlalu lama.'
                };
            }
            
            console.error('❌ Atlantic API Unknown Error:', error);
            return {
                success: false,
                message: error.message || 'Terjadi kesalahan saat menghubungi Atlantic API'
            };
        }
    }

    async generateQRCode(qrString, options = {}) {
        try {
            const defaultOptions = {
                errorCorrectionLevel: 'H', // High error correction
                type: 'png',
                margin: 2,
                width: 400,
                color: {
                    dark: '#000000', // QR code color
                    light: '#FFFFFF' // Background color
                }
            };
            
            const qrOptions = { ...defaultOptions, ...options };
            
            // Generate QR code to buffer
            const qrBuffer = await QRCode.toBuffer(qrString, qrOptions);
            
            return qrBuffer;
            
        } catch (error) {
            console.error('❌ QR Code generation error:', error.message);
            throw new Error(`Gagal generate QR code: ${error.message}`);
        }
    }

    async checkDepositStatus(depositId) {
        try {
            console.log(`🔍 Checking deposit status: ${depositId}`);
            const endpoint = '/deposit/status';
            
            if (!depositId) {
                throw new Error('Deposit ID diperlukan');
            }
            
            const requestData = {
                api_key: this.apiKey,
                id: depositId
            };
            
            if (this.debug) {
                console.log('📤 Atlantic Status Request:', { endpoint, data: { ...requestData, api_key: '***' } });
            }
            
            const response = await axios.post(`${this.baseURL}${endpoint}`,
                new URLSearchParams(requestData).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: this.timeout
                }
            );
            
            if (this.debug) {
                console.log('📥 Atlantic Status Response:', response.data);
            }
            
            if (!response.data.status) {
                throw new Error(response.data.message || 'Gagal cek status deposit');
            }
            
            console.log(`✅ Deposit status: ${depositId} = ${response.data.data.status}`);
            
            return {
                success: true,
                data: response.data.data,
                message: 'Status deposit berhasil dicek'
            };
            
        } catch (error) {
            console.error('❌ Atlantic API Error (checkDepositStatus):', error.message);
            
            if (error.response) {
                const errorData = error.response.data;
                return {
                    success: false,
                    message: errorData.message || `Error ${error.response.status}`,
                    errorCode: error.response.status
                };
            } else if (error.request) {
                return {
                    success: false,
                    message: 'Tidak ada respon dari server Atlantic'
                };
            }
            
            return {
                success: false,
                message: error.message || 'Gagal mengecek status deposit'
            };
        }
    }

    async checkInstantDeposit(depositId, action = false) {
        try {
            console.log(`⚡ Checking instant deposit: ${depositId}, action: ${action}`);
            const endpoint = '/deposit/instant';
            
            if (!depositId) {
                throw new Error('Deposit ID diperlukan');
            }
            
            const requestData = {
                api_key: this.apiKey,
                id: depositId,
                action: action ? 'true' : 'false'
            };
            
            if (this.debug) {
                console.log('📤 Atlantic Instant Check Request:', { 
                    endpoint, 
                    data: { ...requestData, api_key: '***HIDDEN***' } 
                });
            }
            
            const response = await axios.post(`${this.baseURL}${endpoint}`,
                new URLSearchParams(requestData).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: this.timeout
                }
            );
            
            console.log(`📥 Atlantic Instant Check Response for ${depositId}:`, response.data.data?.status);
            
            if (this.debug) {
                console.log('📥 Atlantic Instant Check Response:', response.data);
            }
            
            if (!response.data.status) {
                throw new Error(response.data.message || 'Gagal cek status instan');
            }
            
            return {
                success: true,
                data: response.data.data,
                message: 'Status instan berhasil dicek'
            };
            
        } catch (error) {
            console.error('❌ Atlantic API Error (checkInstantDeposit):', error.message);
            
            if (error.response) {
                const errorData = error.response.data;
                return {
                    success: false,
                    message: errorData.message || `Error ${error.response.status}`,
                    errorCode: error.response.status,
                    data: errorData
                };
            } else if (error.request) {
                return {
                    success: false,
                    message: 'Tidak ada respon dari server Atlantic'
                };
            }
            
            return {
                success: false,
                message: error.message || 'Gagal mengecek status instan'
            };
        }
    }

    async cancelDeposit(depositId) {
        try {
            console.log(`❌ Canceling deposit: ${depositId}`);
            const endpoint = '/deposit/cancel';
            
            if (!depositId) {
                throw new Error('Deposit ID diperlukan');
            }
            
            const requestData = {
                api_key: this.apiKey,
                id: depositId
            };
            
            if (this.debug) {
                console.log('📤 Atlantic Cancel Request:', { endpoint, data: { ...requestData, api_key: '***' } });
            }
            
            const response = await axios.post(`${this.baseURL}${endpoint}`,
                new URLSearchParams(requestData).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: this.timeout
                }
            );
            
            if (this.debug) {
                console.log('📥 Atlantic Cancel Response:', response.data);
            }
            
            if (!response.data.status) {
                throw new Error(response.data.message || 'Gagal membatalkan deposit');
            }
            
            console.log(`✅ Deposit ${depositId} canceled successfully`);
            
            return {
                success: true,
                data: response.data.data,
                message: 'Deposit berhasil dibatalkan'
            };
            
        } catch (error) {
            console.error('❌ Atlantic API Error (cancelDeposit):', error.message);
            
            if (error.response) {
                const errorData = error.response.data;
                return {
                    success: false,
                    message: errorData.message || `Error ${error.response.status}`,
                    errorCode: error.response.status
                };
            } else if (error.request) {
                return {
                    success: false,
                    message: 'Tidak ada respon dari server Atlantic'
                };
            }
            
            return {
                success: false,
                message: error.message || 'Gagal membatalkan deposit'
            };
        }
    }

    async validateApiKey() {
        try {
            console.log('🔐 Validating Atlantic API Key...');
            const endpoint = '/deposit/metode';
            const requestData = {
                api_key: this.apiKey,
                type: 'ewallet'
            };
            
            const response = await axios.post(`${this.baseURL}${endpoint}`,
                new URLSearchParams(requestData).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: 5000
                }
            );
            
            const isValid = response.data.status === true;
            console.log(`✅ Atlantic API Key validation: ${isValid ? 'VALID' : 'INVALID'}`);
            
            return isValid;
            
        } catch (error) {
            console.error('❌ Atlantic API Key Validation Failed:', error.message);
            return false;
        }
    }
    
    async testConnection() {
        try {
            console.log('\n🔍 Testing Atlantic API Connection...');
            console.log('🔑 API Key:', this.apiKey?.substring(0, 8) + '...');
            console.log('🌐 Base URL:', this.baseURL);
            
            const isValid = await this.validateApiKey();
            
            if (isValid) {
                console.log('✅ Atlantic API Connected Successfully');
                return {
                    success: true,
                    message: '✅ Atlantic API Connected Successfully',
                    apiKey: this.apiKey?.substring(0, 8) + '...'
                };
            } else {
                console.log('❌ Atlantic API Connection Failed');
                return {
                    success: false,
                    message: '❌ Atlantic API Connection Failed',
                    error: 'API Key tidak valid atau server tidak merespon'
                };
            }
            
        } catch (error) {
            console.error('❌ Atlantic API Test Failed:', error.message);
            return {
                success: false,
                message: `❌ Atlantic API Test Failed: ${error.message}`,
                error: error.message
            };
        }
    }
}

module.exports = new AtlanticService();
