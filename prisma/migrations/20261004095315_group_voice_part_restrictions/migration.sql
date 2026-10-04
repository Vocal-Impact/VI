-- AlterTable
ALTER TABLE "whatsapp_group" ADD COLUMN     "allowedVoiceTypes" "VoiceType"[] DEFAULT ARRAY[]::"VoiceType"[];
