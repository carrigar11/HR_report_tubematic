import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { companyRegistration } from '../api'
import './RegisterCompany.css'

const REDIRECT_DELAY_MS = 2500

const TYPE_OF_BUSINESS_OPTIONS = [
  'Restaurant',
  'Cafe',
  'QSR',
  'Cloud Kitchen',
  'Food Truck',
  'Catering',
  'Bakery',
  'Retail (F&B)',
  'Other',
]

export default function RegisterCompany() {
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [gstin, setGstin] = useState('')
  const [pan, setPan] = useState('')
  const [gstNumber, setGstNumber] = useState('')
  const [businessNameGst, setBusinessNameGst] = useState('')
  const [aadhar, setAadhar] = useState('')
  const [typeOfBusiness, setTypeOfBusiness] = useState('')
  const [typeOfBusinessOther, setTypeOfBusinessOther] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!message || !message.includes('submitted')) return
    const t = setTimeout(() => navigate('/login', { replace: true }), REDIRECT_DELAY_MS)
    return () => clearTimeout(t)
  }, [message, navigate])

  const effectiveTypeOfBusiness =
    typeOfBusiness === 'Other' && typeOfBusinessOther.trim()
      ? `Other: ${typeOfBusinessOther.trim()}`
      : typeOfBusiness.trim()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    if (!pan.trim()) {
      setMessage('PAN Card (Company or Owner) is required.')
      return
    }
    if (!aadhar.trim()) {
      setMessage('Aadhar card number is required.')
      return
    }
    if (typeOfBusiness === 'Other' && !typeOfBusinessOther.trim()) {
      setMessage('Please specify the type of business when "Other" is selected.')
      return
    }
    setLoading(true)
    try {
      const payload = {
        company_name: companyName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
        pan: pan.trim(),
        aadhar: aadhar.trim(),
      }
      if (companyUrl.trim()) payload.company_url = companyUrl.trim()
      if (gstin.trim()) payload.gstin = gstin.trim()
      if (gstNumber.trim()) payload.gst_number = gstNumber.trim()
      if (businessNameGst.trim()) payload.business_name_gst = businessNameGst.trim()
      if (effectiveTypeOfBusiness) payload.type_of_business = effectiveTypeOfBusiness
      const { data } = await companyRegistration.submit(payload)
      let msg = data?.message || 'Request submitted. We will get back to you.'
      if (data?.email_sent === false && data?.email_note) {
        msg += ' ' + data.email_note
      }
      setMessage(msg)
      setCompanyName('')
      setContactEmail('')
      setContactPhone('')
      setAddress('')
      setCompanyUrl('')
      setGstin('')
      setPan('')
      setGstNumber('')
      setBusinessNameGst('')
      setAadhar('')
      setTypeOfBusiness('')
      setTypeOfBusinessOther('')
    } catch (err) {
      setMessage(err.response?.data?.error || err.message || 'Failed to submit')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="registerCompanyPage">
      <div className="registerCompanyCard card">
        <h1 className="registerCompanyTitle">Register your company</h1>
        <p className="registerCompanySub">Submit your details and we'll get back to you.</p>
        {message && (
          <div className={`registerCompanyMessage ${message.includes('submitted') ? 'success' : 'error'}`}>
            {message}
            {message.includes('submitted') && <span className="registerCompanyRedirectHint"> Redirecting to sign in…</span>}
          </div>
        )}
        <form onSubmit={handleSubmit} className="registerCompanyForm">
          <div className="registerCompanyFormInner">
            <section className="registerCompanySection">
              <h3 className="registerCompanySectionTitle">Company & contact</h3>
              <label className="label">Company name <span className="required">*</span></label>
              <input
                type="text"
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your company name"
                required
              />
              <label className="label">Contact email <span className="required">*</span></label>
              <input
                type="email"
                className="input"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="contact@company.com"
                required
              />
              <label className="label">Contact phone (optional)</label>
              <input
                type="text"
                className="input"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 9876543210"
              />
              <label className="label">Company URL (optional)</label>
              <input
                type="url"
                className="input"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://www.example.com"
              />
              <label className="label">Address (optional)</label>
              <textarea
                className="input"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Company address"
              />
            </section>

            <section className="registerCompanySection">
              <h3 className="registerCompanySectionTitle">Documents & business</h3>
              <label className="label">PAN Card (Company or Owner) <span className="required">*</span></label>
              <input
                type="text"
                className="input"
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                placeholder="e.g. AABCU9603R"
                required
              />
              <label className="label">Aadhar card number <span className="required">*</span></label>
              <input
                type="text"
                className="input"
                value={aadhar}
                onChange={(e) => setAadhar(e.target.value)}
                placeholder="12-digit Aadhar"
                required
              />
              <label className="label">Business name (as per GST/PAN) (optional)</label>
              <input
                type="text"
                className="input"
                value={businessNameGst}
                onChange={(e) => setBusinessNameGst(e.target.value)}
                placeholder="Legal business name"
              />
              <label className="label">GSTIN (optional)</label>
              <input
                type="text"
                className="input"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="e.g. 27AABCU9603R1ZM"
              />
              <label className="label">GST Number (optional)</label>
              <input
                type="text"
                className="input"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="GST number"
              />
              <label className="label">Type of business</label>
              <select
                className="input"
                value={typeOfBusiness}
                onChange={(e) => setTypeOfBusiness(e.target.value)}
              >
                <option value="">Select…</option>
                {TYPE_OF_BUSINESS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {typeOfBusiness === 'Other' && (
                <div className="registerCompanyOtherWrap">
                  <label className="label">Please specify type of business <span className="required">*</span></label>
                  <input
                    type="text"
                    className="input"
                    value={typeOfBusinessOther}
                    onChange={(e) => setTypeOfBusinessOther(e.target.value)}
                    placeholder="e.g. Manufacturing, Services…"
                  />
                </div>
              )}
            </section>
          </div>
          <button type="submit" className="btn btn-primary registerCompanyBtn" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
        <p className="registerCompanyBack">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
